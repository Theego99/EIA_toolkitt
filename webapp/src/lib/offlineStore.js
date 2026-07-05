/**
 * offlineStore.js
 * 
 * IndexedDB wrapper for offline-first data storage.
 * All writes go here first, then sync to Supabase when online.
 * 
 * Stores:
 *   projects    — full project objects
 *   syncQueue   — pending mutations to replay when back online
 *   templates   — custom task templates
 */

const DB_NAME = 'eia-toolkit';
const DB_VERSION = 2;

let _db = null;

export async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const sq = db.createObjectStore('syncQueue', { keyPath: 'qid', autoIncrement: true });
        sq.createIndex('by_table', 'table');
      }
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// ── Generic helpers ───────────────────────────────────────────────────────────

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readonly');
    const req = t.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function saveProjectLocal(project) {
  await tx('projects', 'readwrite', store => store.put({
    ...project,
    _updatedAt: Date.now(),
  }));
}

export async function getAllProjectsLocal() {
  return getAll('projects');
}

export async function deleteProjectLocal(id) {
  await tx('projects', 'readwrite', store => store.delete(id));
}

export async function getProjectLocal(id) {
  return tx('projects', 'readonly', store => store.get(id));
}

// ── Sync Queue ────────────────────────────────────────────────────────────────
// Each entry: { qid, table, op:'upsert'|'delete', payload, timestamp }

export async function enqueue(table, op, payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('syncQueue', 'readwrite');
    const req = t.objectStore('syncQueue').add({
      table, op, payload, timestamp: Date.now(), retries: 0,
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSyncQueue() {
  return getAll('syncQueue');
}

export async function removeFromQueue(qid) {
  await tx('syncQueue', 'readwrite', store => store.delete(qid));
}

export async function getSyncQueueLength() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('syncQueue', 'readonly');
    const req = t.objectStore('syncQueue').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function saveTemplate(template) {
  // template: { id, name, surveyType, description, stages: { 1:[tasks], 2:[tasks], ... } }
  await tx('templates', 'readwrite', store => store.put({
    ...template,
    _updatedAt: Date.now(),
  }));
}

export async function getAllTemplates() {
  return getAll('templates');
}

export async function deleteTemplate(id) {
  await tx('templates', 'readwrite', store => store.delete(id));
}

// ── Sync engine ───────────────────────────────────────────────────────────────
// Called when app comes back online. Replays queued mutations against Supabase.

export async function flushSyncQueue(supabase) {
  if (!supabase || !navigator.onLine) return { synced: 0, failed: 0 };

  const queue = await getSyncQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      if (entry.table === 'projects') {
        if (entry.op === 'upsert') {
          // Map app fields → DB columns
          const { error } = await supabase.from('projects').upsert(entry.payload);
          if (error) throw error;
        } else if (entry.op === 'delete') {
          const { error } = await supabase.from('projects').delete().eq('id', entry.payload.id);
          if (error) throw error;
        }
      } else if (entry.table === 'species') {
        if (entry.op === 'upsert') {
          const { error } = await supabase.from('species').upsert(entry.payload);
          if (error) throw error;
        } else if (entry.op === 'delete') {
          const { error } = await supabase.from('species').delete().eq('id', entry.payload.id);
          if (error) throw error;
        }
      } else if (entry.table === 'comments') {
        if (entry.op === 'insert') {
          const { error } = await supabase.from('comments').insert(entry.payload);
          if (error) throw error;
        }
      }

      await removeFromQueue(entry.qid);
      synced++;
    } catch (err) {
      console.warn('[Sync] Failed to sync entry', entry.qid, err.message);
      failed++;
    }
  }

  console.log(`[Sync] Flushed: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

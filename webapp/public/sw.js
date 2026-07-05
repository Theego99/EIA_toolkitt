// EIA Toolkit — Service Worker
// Strategy:
//   - Static assets (JS/CSS/HTML): Cache-first (fast loads, works offline)
//   - Supabase API calls: Network-first with cache fallback
//   - Report generation (Lambda): Network-only (can't work offline)

const CACHE_NAME = 'eia-toolkit-v1';
const STATIC_CACHE = 'eia-static-v1';
const DATA_CACHE = 'eia-data-v1';

// Base path the SW is served from (e.g. "/" locally, "/EIA_toolkitt/" on
// GitHub Pages). Derived from the SW's own location so it works on any subpath.
const BASE = new URL('./', self.location).pathname;

// Assets to pre-cache on install (relative to BASE so the subpath resolves)
const PRECACHE_URLS = [BASE, BASE + 'index.html'];

// ── INSTALL ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Add individually so one 404 doesn't abort the whole install
      return Promise.all(
        PRECACHE_URLS.map((u) => cache.add(u).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't intercept Chrome extensions or non-HTTP
  if (!event.request.url.startsWith('http')) return;

  // Supabase API — network first, cache fallback (read-only GET data)
  if (url.hostname.includes('supabase.co')) {
    if (event.request.method === 'GET') {
      event.respondWith(networkFirstWithCache(event.request, DATA_CACHE));
    }
    // POST/PATCH/DELETE — network only, no caching
    return;
  }

  // Lambda report generation — network only
  if (url.hostname.includes('lambda-url') || url.hostname.includes('amazonaws.com')) {
    return; // let browser handle normally
  }

  // Static assets — cache first
  event.respondWith(cacheFirstWithNetwork(event.request));
});

// Cache-first: serve from cache, update cache in background
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Update cache in background (stale-while-revalidate)
    fetch(request).then(response => {
      if (response && response.status === 200) {
        caches.open(STATIC_CACHE).then(cache => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // Offline fallback — return the cached index.html for navigation
    if (request.mode === 'navigate') {
      return caches.match(BASE + 'index.html');
    }
    throw e;
  }
}

// Network-first: try network, fall back to cache
async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw e;
  }
}

// ── BACKGROUND SYNC (offline mutations) ──────────────────
// When user edits project data offline, sync when back online.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-projects') {
    event.waitUntil(syncPendingChanges());
  }
});

async function syncPendingChanges() {
  // Read pending changes from IndexedDB and replay them against Supabase
  // (Full implementation in Phase 2 — for MVP, offline is read-only)
  console.log('[SW] Syncing pending offline changes...');
}

// ── PUSH NOTIFICATIONS (future: deadline alerts) ──────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'EIAツールキット', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'eia-notification',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

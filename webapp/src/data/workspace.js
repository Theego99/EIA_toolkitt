import { openDB } from "idb";
import {
  mergeProjects,
  normalizeProject,
  recordChange,
  now,
  uid,
} from "../domain/model.js";

const TABLE = "projects";
const BUCKET = "workspace-evidence";
const message = (e) => e?.message || String(e);
export class Workspace {
  constructor(profile, client = null) {
    this.profile = profile;
    this.client = client;
    this.scope = `${profile.organization_id}:${profile.id}`;
    this.name = `wildpass-workspace-v1:${this.scope}`;
    this.listeners = new Set();
    this.channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(this.name)
        : null;
    if (this.channel) this.channel.onmessage = () => this.emit(false);
    this.ready = openDB(this.name, 1, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" });
        db.createObjectStore("files", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  async metadata(key, value) {
    const db = await this.ready;
    if (value !== undefined) await db.put("meta", value, key);
    return db.get("meta", key);
  }
  emit(broadcast = true) {
    this.listeners.forEach((fn) => fn());
    if (broadcast) this.channel?.postMessage("changed");
  }
  async close() {
    this.channel?.close();
    if (this.running) await this.running.catch(() => {});
    (await this.ready).close();
  }
  async list() {
    return (await (await this.ready).getAll("projects"))
      .map((r) => ({
        ...r.current,
        _sync: r.dirty
          ? r.conflict
            ? "conflict"
            : r.error
              ? "error"
              : "pending"
          : "synced",
        _error: r.error || "",
        _conflict: r.conflict,
      }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async pending() {
    return (await (await this.ready).getAll("projects")).filter((r) => r.dirty)
      .length;
  }
  async create(project) {
    if (!project.name?.trim())
      throw new Error("プロジェクト名を入力してください。");
    if (project.organization_id !== this.profile.organization_id)
      throw new Error("組織が一致しません。");
    const db = await this.ready;
    await db.add("projects", {
      id: project.id,
      current: normalizeProject(project),
      base: null,
      dirty: true,
      revision: 1,
    });
    this.emit();
    return project.id;
  }
  async change(id, action, transform, files = []) {
    const db = await this.ready,
      tx = db.transaction(["projects", "files"], "readwrite");
    const row = await tx.objectStore("projects").get(id);
    if (!row) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error("プロジェクトが見つかりません。");
    }
    try {
      row.current = recordChange(row.current, this.profile, action, transform);
      row.dirty = true;
      row.revision++;
      row.error = "";
      await tx.objectStore("projects").put(row);
      for (const f of files) await tx.objectStore("files").put(f);
      await tx.done;
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* transaction may already be aborted */
      }
      await tx.done.catch(() => {});
      throw e;
    }
    this.emit();
  }
  async attach(id, taskId, file, observationId = "") {
    if (!file.size || file.size > 50 * 1024 * 1024)
      throw new Error("1ファイルは空でない50MB以下のファイルにしてください。");
    const evidenceId = uid(),
      bytes = await file.arrayBuffer();
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const path = `${this.profile.organization_id}/${id}/${evidenceId}/${file.name.replace(/[^\p{L}\p{N}._-]/gu, "_")}`;
    const doc = {
      id: evidenceId,
      name: file.name,
      size: file.size,
      type: file.type,
      taskId,
      observationId,
      sha256: hash,
      storage_path: path,
      pending: true,
      uploadedBy: this.profile.name,
      uploadedById: this.profile.id,
      uploadedAt: now(),
    };
    await this.change(
      id,
      `資料追加: ${file.name}`,
      (p) => {
        const entry = Object.entries(p.tasks).find(([, ts]) =>
          ts.some((t) => t.id === taskId),
        );
        if (!entry) throw new Error("資料に紐づける業務を選択してください。");
        doc.stage = entry[0];
        p.documents.push(doc);
        return p;
      },
      [
        {
          id: evidenceId,
          projectId: id,
          blob: new Blob([bytes], { type: file.type }),
          path,
          uploaded: false,
        },
      ],
    );
    return doc;
  }
  async file(doc) {
    const cached = await (await this.ready).get("files", doc.id);
    if (cached?.blob) {
      await this.verifyFile(doc, cached.blob);
      return cached.blob;
    }
    if (!this.client)
      throw new Error(
        "この端末にはファイル本体がありません。オンラインで事前ダウンロードしてください。",
      );
    if (!doc.storage_path)
      throw new Error(
        "旧資料の保存先を確認できません。原本を業務に再添付してください。",
      );
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .download(doc.storage_path);
    if (error) throw error;
    await this.verifyFile(doc, data);
    await (
      await this.ready
    ).put("files", {
      id: doc.id,
      projectId: doc.storage_path.split("/")[1],
      path: doc.storage_path,
      blob: data,
      uploaded: true,
    });
    return data;
  }
  async verifyFile(doc, data) {
    if (doc.sha256) {
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await data.arrayBuffer()),
        ),
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== doc.sha256)
        throw new Error(`資料の検証に失敗しました: ${doc.name}`);
    }
  }
  async pull() {
    const data = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error } = await this.client
        .from(TABLE)
        .select("*")
        .eq("organization_id", this.profile.organization_id)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      data.push(...page);
      if (page.length < pageSize) break;
    }
    const db = await this.ready,
      tx = db.transaction("projects", "readwrite");
    for (const raw of data) {
      const remote = normalizeProject(raw),
        row = await tx.store.get(remote.id);
      if (!row?.dirty)
        await tx.store.put({
          id: remote.id,
          current: remote,
          base: remote,
          revision: (row?.revision || 0) + 1,
          dirty: false,
        });
      else if (row.base && remote.version !== row.base.version) {
        const merged = mergeProjects(row.base, row.current, remote);
        if (merged.conflicts.length) {
          row.conflict = { paths: merged.conflicts, remote };
          row.error =
            "同じ項目に他の担当者の更新があります。内容を比較してください。";
        } else {
          row.current = merged.value;
          row.base = remote;
          row.conflict = null;
          row.revision++;
        }
        await tx.store.put(row);
      }
    }
    await tx.done;
    this.emit();
  }
  async sync() {
    if (!this.client) return;
    if (this.running) return this.running;
    const run = async () => {
      await this.pull();
      const db = await this.ready;
      for (const original of await db.getAll("projects")) {
        if (!original.dirty || original.conflict) continue;
        try {
          const docs = [
            ...(original.current.documents || []),
            ...(original.current.workspace?.reports || []),
          ];
          for (const doc of docs.filter((d) => d.pending && d.storage_path)) {
            const file = await db.get("files", doc.id);
            if (!file?.blob)
              throw new Error(
                `未送信ファイルがこの端末にありません: ${doc.name}`,
              );
            if (!file.uploaded) {
              const { error } = await this.client.storage
                .from(BUCKET)
                .upload(file.path, file.blob, {
                  upsert: false,
                  contentType: file.blob.type || "application/octet-stream",
                });
              if (
                error &&
                !["409", "Duplicate"].includes(
                  String(error.statusCode || error.error),
                )
              ) {
                // An interrupted successful upload can be retried: verify bytes before accepting an existing object.
                if (!/already exists|duplicate/i.test(message(error)))
                  throw error;
              }
              const { data, error: checkError } = await this.client.storage
                .from(BUCKET)
                .download(file.path);
              if (checkError) throw checkError;
              const hash = [
                ...new Uint8Array(
                  await crypto.subtle.digest(
                    "SHA-256",
                    await data.arrayBuffer(),
                  ),
                ),
              ]
                .map((v) => v.toString(16).padStart(2, "0"))
                .join("");
              if (hash !== doc.sha256)
                throw new Error(
                  "アップロード後の検証に失敗しました。元ファイルは端末に残っています。",
                );
              await db.put("files", { ...file, uploaded: true });
            }
            doc.pending = false;
          }
          const { data, error } = await this.client.rpc(
            "save_workspace_project",
            {
              p_row: original.current,
              p_expected: original.base?.version || 0,
            },
          );
          if (error) throw error;
          const remote = normalizeProject(Array.isArray(data) ? data[0] : data);
          const tx = db.transaction("projects", "readwrite"),
            latest = await tx.store.get(original.id);
          if (latest.revision === original.revision)
            await tx.store.put({
              id: remote.id,
              current: remote,
              base: remote,
              dirty: false,
              revision: latest.revision + 1,
            });
          else {
            const merged = mergeProjects(
              original.current,
              latest.current,
              remote,
            );
            await tx.store.put({
              ...latest,
              current: merged.value,
              base: remote,
              conflict: merged.conflicts.length
                ? { paths: merged.conflicts, remote }
                : null,
            });
          }
          await tx.done;
        } catch (e) {
          const tx = db.transaction("projects", "readwrite"),
            latest = await tx.store.get(original.id);
          latest.error = message(e);
          latest.attempts = (latest.attempts || 0) + 1;
          await tx.store.put(latest);
          await tx.done;
        }
        this.emit();
      }
      await this.pull();
    };
    this.running = (
      globalThis.navigator?.locks
        ? navigator.locks.request(`sync:${this.name}`, run)
        : run()
    ).finally(() => {
      this.running = null;
    });
    return this.running;
  }
  async resolve(id, choice) {
    const db = await this.ready,
      tx = db.transaction(["projects", "meta"], "readwrite"),
      row = await tx.objectStore("projects").get(id);
    if (!row.conflict || !["local", "remote"].includes(choice))
      throw new Error("解決方法を選択してください。");
    await tx
      .objectStore("meta")
      .put(
        { at: now(), local: row.current, remote: row.conflict.remote },
        `conflict-backup:${id}:${uid()}`,
      );
    const selected = choice === "local" ? row.current : row.conflict.remote;
    const mergeBase = row.conflict.mergeBase ?? row.base;
    const merged = mergeProjects(mergeBase, row.current, row.conflict.remote);
    row.current =
      choice === "local"
        ? merged.value
        : mergeProjects(mergeBase, row.conflict.remote, row.current).value;
    row.current.activity = [
      ...row.current.activity,
      {
        id: uid(),
        at: now(),
        actor: { id: this.profile.id, name: this.profile.name },
        action: `競合解決: ${choice === "local" ? "端末" : "共有"}側の競合項目を採用 (${selected.id})`,
      },
    ];
    if (row.conflict.kind !== "backup") row.base = row.conflict.remote;
    row.conflict = null;
    row.error = "";
    row.dirty = true;
    row.revision++;
    await tx.objectStore("projects").put(row);
    await tx.done;
    this.emit();
  }
  async backup() {
    const db = await this.ready;
    const tx = db.transaction(["projects", "files", "meta"], "readonly");
    const rows = await tx.objectStore("projects").getAll(),
      files = await tx.objectStore("files").getAll(),
      keys = await tx.objectStore("meta").getAllKeys(),
      values = await tx.objectStore("meta").getAll();
    await tx.done;
    return {
      format: "wildpass-backup-v1",
      scope: this.scope,
      exportedAt: now(),
      rows,
      recovery: keys.map((key, index) => ({ key, value: values[index] })),
      files,
    };
  }
  async recoverLegacy() {
    if (!indexedDB.databases)
      throw new Error(
        "このブラウザーでは旧データの確認に対応していません。管理者に連絡してください。",
      );
    if (!(await indexedDB.databases()).some((d) => d.name === "eia-toolkit"))
      return { projects: 0, files: 0 };
    const legacy = await openDB("eia-toolkit");
    let rows, queue, uploads;
    try {
      rows = legacy.objectStoreNames.contains("projects")
        ? await legacy.getAll("projects")
        : [];
      queue = legacy.objectStoreNames.contains("syncQueue")
        ? await legacy.getAll("syncQueue")
        : [];
      uploads = legacy.objectStoreNames.contains("uploads")
        ? await legacy.getAll("uploads")
        : [];
    } finally {
      legacy.close();
    }
    const candidates = new Map(rows.map((p) => [String(p.id), p]));
    for (const q of queue)
      if (q.table === "projects" && q.op === "upsert" && q.payload?.id)
        candidates.set(String(q.payload.id), q.payload);
    const db = await this.ready;
    let recovered = 0,
      fileCount = 0;
    for (const [id, raw] of candidates) {
      const existing = await db.get("projects", id);
      if (raw.organization_id !== this.profile.organization_id && !existing)
        continue;
      if (
        raw.organization_id &&
        raw.organization_id !== this.profile.organization_id
      )
        continue;
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) continue;
      const marker = `legacy:${id}:${raw._updatedAt || raw.updated_at || "unknown"}`;
      if (await db.get("meta", marker)) continue;
      const current = normalizeProject({
        ...raw,
        id,
        organization_id: this.profile.organization_id,
      });
      if (existing) {
        current.workspace = existing.current.workspace;
        current.version = existing.current.version;
      }
      const files = [];
      for (const upload of uploads.filter((u) => String(u.projectId) === id)) {
        if (!upload.blob) continue;
        let doc = current.documents.find((d) => d.uploadId === upload.id),
          observation = current.species_data.find((s) =>
            (s.photos || []).some((photo) => photo.uploadId === upload.id),
          );
        if (!doc) {
          doc = {
            id: uid(),
            name: upload.name || "旧版の添付",
            observationId: observation?.id || "",
            taskId: observation?.taskId || "",
            uploadedAt: current.updated_at,
            uploadedBy: "旧版から復旧",
          };
          current.documents.push(doc);
        }
        doc.storage_path = `${this.profile.organization_id}/${id}/${doc.id}/recovered`;
        doc.type = upload.blob.type;
        doc.size = upload.blob.size;
        doc.pending = true;
        doc.sha256 = [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              await upload.blob.arrayBuffer(),
            ),
          ),
        ]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
        files.push({
          id: doc.id,
          projectId: id,
          blob: upload.blob,
          path: doc.storage_path,
          uploaded: false,
        });
      }
      const tx = db.transaction(["projects", "files", "meta"], "readwrite");
      // A second tab may have edited the project while hashes were calculated.
      const latest = await tx.objectStore("projects").get(id);
      if (latest) {
        latest.conflict = {
          paths: ["旧版の記録（基準版がないため内容の比較が必要）"],
          remote: current,
          kind: "backup",
          mergeBase: {},
        };
        latest.dirty = true;
        latest.revision++;
        await tx.objectStore("projects").put(latest);
      } else
        await tx
          .objectStore("projects")
          .put({ id, current, base: null, dirty: true, revision: 1 });
      for (const file of files)
        if (!(await tx.objectStore("files").get(file.id)))
          await tx.objectStore("files").put(file);
      await tx.objectStore("meta").put({ at: now(), original: raw }, marker);
      await tx.done;
      recovered++;
      fileCount += files.length;
    }
    this.emit();
    return { projects: recovered, files: fileCount };
  }
  async restore(backup, files) {
    if (
      backup.format !== "wildpass-backup-v1" ||
      backup.scope !== this.scope ||
      !Array.isArray(backup.rows)
    )
      throw new Error("このアカウントのWildpassバックアップではありません。");
    for (const file of files) {
      const row = backup.rows.find((r) => r.id === file.projectId);
      if (!row) throw new Error("原本のプロジェクトが一致しません。");
      const doc = [
        ...(row.current.documents || []),
        ...(row.current.workspace?.reports || []),
      ].find((d) => d.id === file.id);
      // Recovery-only blobs may be retained without a currently selected record.
      if (doc) await this.verifyFile(doc, file.blob);
      if (
        file.path &&
        !file.path.startsWith(
          `${this.profile.organization_id}/${file.projectId}/`,
        )
      )
        throw new Error("原本の組織が一致しません。");
    }
    const db = await this.ready,
      tx = db.transaction(["projects", "files", "meta"], "readwrite");
    try {
      for (const row of backup.rows) {
        if (
          !row.id ||
          row.current?.id !== row.id ||
          row.current.organization_id !== this.profile.organization_id
        )
          throw new Error("バックアップの組織・プロジェクトが一致しません。");
        const existing = await tx.objectStore("projects").get(row.id);
        if (!existing)
          await tx.objectStore("projects").put({
            ...row,
            current: normalizeProject(row.current),
            dirty: true,
            revision: 1,
          });
        else {
          await tx
            .objectStore("meta")
            .put(row, `restore-backup:${row.id}:${uid()}`);
          const merged = mergeProjects(
            row.base || {},
            existing.current,
            normalizeProject(row.current),
          );
          existing.current = merged.value;
          existing.dirty = true;
          existing.revision++;
          if (merged.conflicts.length)
            existing.conflict = {
              paths: merged.conflicts,
              remote: normalizeProject(row.current),
              kind: "backup",
              mergeBase: row.base || {},
            };
          await tx.objectStore("projects").put(existing);
        }
      }
      for (const file of files)
        if (!(await tx.objectStore("files").get(file.id)))
          await tx.objectStore("files").put(file);
      for (const entry of backup.recovery || [])
        await tx.objectStore("meta").put(entry, `restored-recovery:${uid()}`);
      await tx.done;
      this.emit();
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already aborted */
      }
      await tx.done.catch(() => {});
      throw e;
    }
  }
}

import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { Workspace } from "../src/data/workspace.js";
import { openDB, deleteDB } from "idb";
import { newProject, uid } from "../src/domain/model.js";
function profile() {
  return { id: uid(), organization_id: uid(), name: "試験担当", role: "pm" };
}
class FakeClient {
  rows = new Map();
  blobs = new Map();
  fail = false;
  beforeSave = null;
  from() {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            range: async (a, b) => ({
              data: [...this.rows.values()]
                .slice(a, b + 1)
                .map((v) => structuredClone(v)),
              error: null,
            }),
          }),
        }),
      }),
    };
  }
  async rpc(_name, { p_row, p_expected }) {
    if (this.beforeSave) await this.beforeSave();
    if (this.fail) return { error: { message: "server unavailable" } };
    const old = this.rows.get(p_row.id);
    if (old && old.version !== p_expected)
      return { error: { message: "conflict" } };
    const row = {
      ...structuredClone(p_row),
      version: p_expected + 1,
      updated_at: new Date().toISOString(),
    };
    this.rows.set(row.id, row);
    return { data: structuredClone(row), error: null };
  }
  storage = {
    from: () => ({
      upload: async (path, blob) => {
        this.blobs.set(path, blob);
        return { error: null };
      },
      download: async (path) => ({
        data: this.blobs.get(path),
        error: this.blobs.has(path) ? null : new Error("missing"),
      }),
    }),
  };
}
test("committed records survive closing and reopening, and accounts remain isolated", async () => {
  const user = profile(),
    w = new Workspace(user),
    p = newProject({ name: "端末試験" }, user);
  await w.create(p);
  await w.change(p.id, "記録", (v) => {
    v.tasks[3][0].note = "電波のない現場で保存";
    return v;
  });
  await w.close();
  const reopened = new Workspace(user),
    other = new Workspace({ ...user, id: uid() });
  assert.equal(
    (await reopened.list())[0].tasks[3][0].note,
    "電波のない現場で保存",
  );
  assert.equal((await other.list()).length, 0);
  await reopened.close();
  await other.close();
});
test("failed transactions do not report success or leave a partial project edit", async () => {
  const user = profile(),
    w = new Workspace(user),
    p = newProject({ name: "原本" }, user);
  await w.create(p);
  await assert.rejects(
    w.change(p.id, "失敗", (v) => {
      v.name = "partial";
      v.organization_id = uid();
      return v;
    }),
    /組織/,
  );
  assert.equal((await w.list())[0].name, "原本");
  await w.close();
});
test("more than eight failed retries preserve changes and recover successfully", async () => {
  const user = profile(),
    client = new FakeClient(),
    w = new Workspace(user, client),
    p = newProject({ name: "同期試験" }, user);
  await w.create(p);
  client.fail = true;
  for (let i = 0; i < 12; i++) await w.sync();
  assert.equal(await w.pending(), 1);
  assert.equal((await w.list())[0].name, "同期試験");
  client.fail = false;
  await w.sync();
  assert.equal(await w.pending(), 0);
  assert.equal(client.rows.size, 1);
  await w.close();
});
test("a new edit made during an in-flight save is retained for the next sync", async () => {
  const user = profile(),
    client = new FakeClient(),
    w = new Workspace(user, client),
    p = newProject({ name: "競争試験" }, user);
  await w.create(p);
  await w.sync();
  await w.change(p.id, "編集1", (v) => {
    v.description = "first";
    return v;
  });
  let resume, entered;
  const entry = new Promise((r) => (entered = r));
  const gate = new Promise((r) => (resume = r));
  client.beforeSave = () => {
    entered();
    return gate;
  };
  const saving = w.sync();
  await entry;
  await w.change(p.id, "編集2", (v) => {
    v.description = "newest";
    return v;
  });
  resume();
  await saving;
  assert.equal((await w.list())[0].description, "newest");
  assert.equal(await w.pending(), 1);
  client.beforeSave = null;
  await w.sync();
  assert.equal(client.rows.get(p.id).description, "newest");
  assert.equal(await w.pending(), 0);
  await w.close();
});
test("two people merge independent offline edits and stop when the same field changes", async () => {
  const a = profile(),
    b = { ...a, id: uid() },
    client = new FakeClient(),
    left = new Workspace(a, client),
    right = new Workspace(b, client),
    p = newProject({ name: "共有試験" }, a);
  await left.create(p);
  await left.sync();
  await right.sync();
  await left.change(p.id, "鳥類", (v) => {
    v.species_data.push({ id: uid(), name: "鳥" });
    return v;
  });
  await right.change(p.id, "本文", (v) => {
    v.description = "右側の本文";
    return v;
  });
  await left.sync();
  await right.sync();
  await left.sync();
  assert.equal((await left.list())[0].species_data.length, 1);
  assert.equal((await left.list())[0].description, "右側の本文");
  await left.change(p.id, "同項目", (v) => {
    v.description = "left";
    return v;
  });
  await right.change(p.id, "同項目", (v) => {
    v.description = "right";
    return v;
  });
  await left.sync();
  await right.sync();
  assert.equal((await right.list())[0]._sync, "conflict");
  assert.equal((await right.list())[0].description, "right");
  assert.equal((await right.list())[0]._conflict.remote.description, "left");
  await right.resolve(p.id, "local");
  await right.sync();
  assert.equal(client.rows.get(p.id).description, "right");
  await left.close();
  await right.close();
});
test("multiple attachments retain both blobs, linked metadata, hashes and retry state", async () => {
  const user = profile(),
    client = new FakeClient(),
    w = new Workspace(user, client),
    p = newProject({ name: "添付試験" }, user);
  await w.create(p);
  const docs = await Promise.all(
    ["a.txt", "b.txt"].map((name) =>
      w.attach(
        p.id,
        p.tasks[3][0].id,
        new File([name], name, { type: "text/plain" }),
      ),
    ),
  );
  assert.equal((await w.list())[0].documents.length, 2);
  assert.equal(await (await w.file(docs[0])).text(), "a.txt");
  assert.equal(docs[0].sha256.length, 64);
  client.fail = true;
  await w.sync();
  assert.equal((await w.list())[0].documents.length, 2);
  client.fail = false;
  await w.sync();
  const row = (await w.list())[0];
  assert.equal(
    row.documents.every((d) => !d.pending),
    true,
  );
  assert.equal(await (await w.file(docs[1])).text(), "b.txt");
  assert.equal(await w.pending(), 0);
  await w.close();
});
test("a backup for a different account cannot overwrite local records", async () => {
  const user = profile(),
    w = new Workspace(user),
    p = newProject({ name: "保護" }, user);
  await w.create(p);
  const backup = await w.backup();
  await assert.rejects(
    w.restore({ ...backup, scope: "different" }, []),
    /アカウント/,
  );
  assert.equal((await w.list())[0].name, "保護");
  await w.close();
});
test("cloud retrieval includes projects beyond a single response page", async () => {
  const user = profile(),
    client = new FakeClient(),
    w = new Workspace(user, client);
  for (let i = 0; i < 503; i++) {
    const p = newProject({ name: `案件${i}` }, user);
    client.rows.set(p.id, p);
  }
  await w.pull();
  assert.equal((await w.list()).length, 503);
  await w.close();
});
test("corrupt backup evidence is rejected before changing any saved record", async () => {
  const user = profile(),
    w = new Workspace(user),
    p = newProject({ name: "原本検証" }, user);
  await w.create(p);
  await w.attach(
    p.id,
    p.tasks[3][0].id,
    new File(["original"], "a.txt", { type: "text/plain" }),
  );
  const backup = await w.backup();
  backup.rows[0].current.name = "corrupt restore";
  await assert.rejects(
    w.restore(
      backup,
      backup.files.map((f) => ({ ...f, blob: new Blob(["corrupt"]) })),
    ),
    /検証/,
  );
  assert.equal((await w.list())[0].name, "原本検証");
  await w.close();
});
test("legacy recovery retains photos and both versions without importing other organizations", async () => {
  await deleteDB("eia-toolkit");
  const legacy = await openDB("eia-toolkit", 1, {
    upgrade(db) {
      for (const name of ["projects", "uploads", "syncQueue"])
        db.createObjectStore(name, { keyPath: "id" });
    },
  });
  const user = profile(),
    w = new Workspace(user),
    p = newProject({ name: "旧版案件" }, user),
    foreign = newProject({ name: "別組織" }, profile());
  p.documents = [{ id: uid(), name: "旧写真", uploadId: "pending-photo" }];
  await legacy.put("projects", p);
  await legacy.put("projects", foreign);
  await legacy.put("uploads", {
    id: "pending-photo",
    projectId: p.id,
    blob: new Blob(["field-photo"], { type: "text/plain" }),
  });
  legacy.close();
  await w.create({ ...p, name: "新版案件", documents: [] });
  const recovered = await w.recoverLegacy();
  assert.deepEqual(recovered, { projects: 1, files: 1 });
  assert.equal((await w.list()).length, 1);
  assert.equal((await w.list())[0]._sync, "conflict");
  assert.equal((await w.list())[0].name, "新版案件");
  await w.resolve(p.id, "remote");
  assert.equal((await w.list())[0].name, "旧版案件");
  const doc = (await w.list())[0].documents[0];
  assert.equal(await (await w.file(doc)).text(), "field-photo");
  assert.equal((await w.recoverLegacy()).projects, 0);
  assert.ok((await w.backup()).recovery.length);
  await w.close();
  await deleteDB("eia-toolkit");
});

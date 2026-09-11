import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { newProject, uid } from "../src/domain/model.js";
test("real PostgreSQL migration, role enforcement, tenant isolation, audit and compare-and-swap", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  await db.exec(
    (await fs.readFile("schema.sql", "utf8")).replace(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
      "",
    ),
  );
  const migration = await fs.readFile(
    "migrations/20260911_workspace.sql",
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  const adminId = uid(),
    otherId = uid(),
    memberId = uid(),
    reviewerId = uid(),
    clientId = uid();
  for (const [id, email] of [
    [adminId, "owner@example.test"],
    [otherId, "other@example.test"],
    [memberId, "field@example.test"],
    [reviewerId, "review@example.test"],
    [clientId, "client@example.test"],
  ])
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data)values($1,$2,$3)",
      [id, email, { name: email, organization_id: uid(), role: "admin" }],
    );
  const user = (
    await db.query("select * from public.profiles where id=$1", [adminId])
  ).rows[0];
  await db.query(
    "update public.profiles set organization_id=$1,role='surveyor' where id=$2",
    [user.organization_id, memberId],
  );
  await db.query(
    "update public.profiles set organization_id=$1,role='reviewer' where id=$2",
    [user.organization_id, reviewerId],
  );
  await db.query(
    "update public.profiles set organization_id=$1,role='client' where id=$2",
    [user.organization_id, clientId],
  );
  async function as(id, fn) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  }
  const save = (p, version) =>
    db.query(
      "select public.save_workspace_project($1::jsonb,$2::bigint) as data",
      [p, version],
    );
  const p = newProject({ name: "共有データ" }, user);
  await as(adminId, async () => {
    const result = await save(p, 0);
    assert.equal(result.rows[0].data.version, 1);
    await assert.rejects(save(p, 0), /競合/);
    await assert.rejects(
      db.query("update public.profiles set role='admin' where id=$1", [
        memberId,
      ]),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select * from public.workspace_audit")).rows.length,
      1,
    );
    await assert.rejects(
      db.exec("delete from public.workspace_audit"),
      /permission denied/,
    );
  });
  await as(otherId, async () => {
    assert.equal(
      (await db.query("select * from public.projects")).rows.length,
      0,
    );
    await assert.rejects(save(p, 1), /組織/);
    assert.equal(
      (await db.query("select * from public.workspace_audit")).rows.length,
      0,
    );
  });
  await as(clientId, async () => {
    assert.equal(
      (await db.query("select * from public.projects")).rows.length,
      1,
    );
    await assert.rejects(save(p, 1), /権限/);
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name)values('workspace-evidence',$1)",
        [`${user.organization_id}/${p.id}/bad.txt`],
      ),
      /row-level security/,
    );
  });
  await as(memberId, async () => {
    await assert.rejects(
      db.query("update public.profiles set organization_id=$1 where id=$2", [
        uid(),
        memberId,
      ]),
      /permission denied/,
    );
    await db.query("update public.profiles set name='更新名' where id=$1", [
      memberId,
    ]);
    await db.query(
      "insert into storage.objects(bucket_id,name)values('workspace-evidence',$1)",
      [`${user.organization_id}/${p.id}/photo.png`],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name)values('workspace-evidence',$1)",
        [`${uid()}/${p.id}/bad.png`],
      ),
      /row-level security/,
    );
  });
  await as(otherId, async () =>
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    ),
  );
  p.tasks[3][0] = {
    ...p.tasks[3][0],
    note: "観察結果",
    status: "review",
    submittedBy: memberId,
  };
  await as(memberId, () => save(p, 1));
  p.tasks[3][0] = {
    ...p.tasks[3][0],
    status: "approved",
    done: true,
    review: {
      by: { id: reviewerId, name: "照査担当" },
      reason: "根拠資料を確認",
    },
  };
  await as(memberId, () => assert.rejects(save(p, 2), /照査権限/));
  await as(reviewerId, async () => {
    const approved = await save(p, 2);
    assert.equal(approved.rows[0].data.version, 3);
  });
  const altered = structuredClone(p);
  altered.species_data = [
    { id: uid(), taskId: p.tasks[3][0].id, name: "差替え記録" },
  ];
  await as(memberId, () => assert.rejects(save(altered, 3), /根拠記録/));
  const forged = structuredClone(p);
  forged.documents = [
    {
      id: uid(),
      name: "偽の原本",
      storage_path: `${uid()}/${p.id}/${uid()}/file`,
      sha256: "a".repeat(64),
    },
  ];
  await as(adminId, () => assert.rejects(save(forged, 3), /保存先/));
  forged.documents[0].storage_path = `${user.organization_id}/${p.id}/${forged.documents[0].id}/file`;
  await as(adminId, () => assert.rejects(save(forged, 3), /アップロード/));
  await as(adminId, async () => {
    await db.query("select public.invite_workspace_member($1,$2)", [
      "invited@example.test",
      "surveyor",
    ]);
  });
  const invitedId = uid();
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,'invited@example.test',$2)",
    [invitedId, { organization_id: uid(), role: "admin" }],
  );
  const invited = (
    await db.query("select * from profiles where id=$1", [invitedId])
  ).rows[0];
  assert.equal(invited.role, "surveyor");
  assert.equal(invited.organization_id, user.organization_id);
  await as(memberId, () =>
    assert.rejects(
      db.query("select public.manage_workspace_member($1,$2,$3)", [
        reviewerId,
        "client",
        true,
      ]),
      /管理者/,
    ),
  );
  await as(adminId, () =>
    assert.rejects(
      db.query("select public.manage_workspace_member($1,$2,$3)", [
        adminId,
        "client",
        true,
      ]),
      /自分自身/,
    ),
  );
  await as(adminId, () =>
    db.query("select public.manage_workspace_member($1,$2,$3)", [
      memberId,
      "surveyor",
      true,
    ]),
  );
  await as(memberId, async () => {
    assert.equal((await db.query("select * from projects")).rows.length, 0);
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(save(p, 3), /権限/);
  });
  await as(adminId, () => {
    return db.query("select public.manage_workspace_member($1,$2,$3)", [
      memberId,
      "surveyor",
      false,
    ]);
  });
  assert.equal(
    (await db.query("select * from workspace_access_audit")).rows.length,
    2,
  );
});

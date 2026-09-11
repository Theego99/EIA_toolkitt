import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseCSV, importCSV } from "../scripts/import-species.mjs";
import {
  mergeProjects,
  newProject,
  taskTransition,
  normalizeProject,
  readiness,
  uid,
} from "../src/domain/model.js";
import {
  calendarMonth,
  deadlineHints,
  scaleHint,
} from "../src/domain/legal.js";
import { CATALOG, suggestSpecies } from "../src/domain/species.js";
import { buildReport, evidencePackage } from "../src/domain/report.js";
import { unzipSync, strFromU8 } from "fflate";
const author = {
    id: uid(),
    organization_id: uid(),
    name: "調査担当",
    role: "surveyor",
  },
  reviewer = { ...author, id: uid(), name: "照査担当", role: "reviewer" };
test("CSV parser preserves commas, quotes, CRLF and multi-line fields", () =>
  assert.deepEqual(parseCSV('a,"b,c","d""e"\r\n"f\ng",h,i'), [
    ["a", "b,c", 'd"e'],
    ["f\ng", "h", "i"],
  ]));
test("every source row is imported reproducibly with original category and encoding", async () => {
  let count = 0;
  for (const source of CATALOG.sources) {
    const data = importCSV(
      await fs.readFile(`data/redlist/${source.filename}`),
      source.filename,
    );
    assert.equal(data.source.sha256, source.sha256);
    assert.equal(data.entries.length, source.count);
    count += source.count;
  }
  assert.equal(count, CATALOG.entries.length);
  assert.ok(CATALOG.entries.some((s) => s.status === "EX"));
  assert.ok(CATALOG.entries.some((s) => s.status === "LP"));
  assert.ok(CATALOG.entries.some((s) => s.status === "DD"));
  const combined = importCSV(
    new TextEncoder().encode(
      "カテゴリー,分類群,和名,学名\n絶滅危惧I類（CR＋EN）,昆虫類,試験種,Example species",
    ),
    "redlist2025_kinrui.csv",
  );
  assert.equal(combined.entries[0].status, "CR+EN");
});
test("species matching normalizes kana and width, returns at most five candidates and preserves sources", () => {
  for (const q of ["おおたか", "ｵｵﾀｶ", "オオタカ"])
    assert.equal(suggestSpecies(q)[0].name, "オオタカ");
  assert.equal(suggestSpecies("").length, 0);
  assert.ok(suggestSpecies("トリ").length <= 5);
  assert.ok(suggestSpecies("オオタカ")[0].source.endsWith(".csv"));
});
test("calendar calculations handle month ends and use actual receipt as governor anchor", () => {
  assert.equal(calendarMonth("2026-01-31"), "2026-02-28");
  assert.equal(calendarMonth("2028-01-31"), "2028-02-29");
  assert.equal(calendarMonth("2026-02-30"), "");
  const hints = deadlineHints(
    {
      noticeDate: "2026-01-10",
      exhibitionEnd: "2026-02-10",
      summaryReceived: "2026-03-01",
    },
    "2",
    "national-general",
  );
  assert.equal(hints.opinionEnd, "2026-02-24");
  assert.equal(hints.governorEnd, "2026-05-30");
  assert.deepEqual(
    deadlineHints({ summaryReceived: "2026-03-01" }, "2", "power"),
    {},
  );
  assert.equal(
    deadlineHints({ exhibitionEnd: "2026-02-10" }, "2", "national-general")
      .governorEnd,
    "",
  );
});
test("solar threshold revision is effective-dated and lower scales are not called exempt", () => {
  assert.match(scaleHint("solar", 25000, "2026-09-11"), /国法の出力規模未満/);
  assert.match(scaleHint("solar", 25000, "2027-04-01"), /第一種/);
  assert.match(scaleHint("wind", 37500, "2026-09-11"), /第二種/);
  assert.match(scaleHint("road", 50000, "2026-09-11"), /対象外/);
});
test("independent offline records merge; same-value conflicts retain both inputs", () => {
  const base = {
    name: "base",
    tasks: {
      3: [
        { id: "a", note: "old" },
        { id: "b", note: "old" },
      ],
    },
    documents: [],
  };
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.tasks[3][0].note = "local";
  remote.tasks[3][1].note = "remote";
  local.documents.push({ id: "local" });
  remote.documents.push({ id: "remote" });
  const merge = mergeProjects(base, local, remote);
  assert.deepEqual(merge.conflicts, []);
  assert.deepEqual(merge.value.documents, [{ id: "local" }, { id: "remote" }]);
  assert.equal(merge.value.tasks[3][1].note, "remote");
  remote.tasks[3][0].note = "other";
  assert.deepEqual(mergeProjects(base, local, remote).conflicts, [
    "tasks.3[a].note",
  ]);
  assert.equal(local.tasks[3][0].note, "local");
});
test("deletion versus concurrent modification causes conflict, not data loss", () => {
  const result = mergeProjects(
    { rows: [{ id: 1, note: "old" }] },
    { rows: [] },
    { rows: [{ id: 1, note: "new" }] },
  );
  assert.deepEqual(result.conflicts, ["rows[1]"]);
});
test("legacy checkboxes are not presented as independent approvals", () => {
  assert.equal(
    normalizeProject({ tasks: { 3: [{ id: 1, done: true }] } }).tasks[3][0]
      .status,
    "doing",
  );
});
test("review needs a saved result, reason, and a different authorized person", () => {
  let p = newProject({ name: "試験" }, author),
    id = p.tasks[3][0].id;
  assert.throws(() => taskTransition(p, id, "review", author), /結果/);
  p.tasks[3][0].note = "結果を記録";
  p = taskTransition(p, id, "review", author);
  assert.throws(
    () =>
      taskTransition(
        p,
        id,
        "approved",
        { ...author, role: "admin" },
        "確認済み",
      ),
    /提出者以外/,
  );
  assert.throws(() => taskTransition(p, id, "approved", reviewer, ""), /理由/);
  p = taskTransition(p, id, "approved", reviewer, "証拠を照合");
  assert.equal(p.tasks[3][0].status, "approved");
  assert.ok(readiness(p).length > 0);
});
test("real Word and ZIP include Japanese notes, source provenance, images, original evidence and snapshot", async () => {
  const p = newProject(
    { name: "報告試験 <&>", client: "試験会社", pref: "長野県" },
    author,
  );
  p.tasks[3][0].note = "現地調査の確認結果";
  p.workspace.chapters.results = "調査結果の本文 & 特殊文字";
  p.species_data.push({
    id: uid(),
    name: "オオタカ",
    status: "NT",
    catalogSource: "redlist2026_birds.csv",
    catalogYear: 2026,
    recordedBy: "試験担当",
    taskId: p.tasks[3][0].id,
  });
  const image = new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ntEAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    { type: "image/png" },
  );
  p.documents = [
    {
      id: uid(),
      name: "写真.png",
      type: "image/png",
      size: image.size,
      taskId: p.tasks[3][0].id,
    },
    {
      id: uid(),
      name: "測定原本.csv",
      type: "text/csv",
      size: 20,
      taskId: p.tasks[3][0].id,
    },
  ];
  const loadFile = async (d) =>
    d.name.endsWith(".png") ? image : new Blob(["項目,結果\nSS,8"]);
  const report = await buildReport(p, {
      loadFile,
      generatedBy: author.name,
      issues: readiness(p),
    }),
    files = unzipSync(new Uint8Array(await report.blob.arrayBuffer()));
  assert.ok(files["[Content_Types].xml"]);
  const xml = strFromU8(files["word/document.xml"]);
  assert.match(xml, /現地調査の確認結果/);
  assert.match(xml, /オオタカ/);
  assert.match(xml, /redlist2026_birds.csv/);
  assert.match(xml, /調査結果の本文 &amp; 特殊文字/);
  assert.ok(Object.keys(files).some((k) => k.startsWith("word/media/")));
  const zip = unzipSync(
    new Uint8Array(
      await (await evidencePackage(p, report, loadFile)).arrayBuffer(),
    ),
  );
  assert.equal(JSON.parse(strFromU8(zip["project-snapshot.json"])).id, p.id);
  assert.ok(zip[`evidence/${p.documents[1].id}_測定原本.csv`]);
  await fs.mkdir("test-artifacts", { recursive: true });
  await fs.writeFile(
    "test-artifacts/report-sample.docx",
    new Uint8Array(await report.blob.arrayBuffer()),
  );
});

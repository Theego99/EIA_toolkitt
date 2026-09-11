import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  Footer,
  PageNumber,
  Header,
} from "docx";
import { zipSync, strToU8 } from "fflate";
import { allTasks, projectStages, STATUS_NAMES, now, uid } from "./model.js";
import { SOURCES, VERIFIED_AT } from "./legal.js";
import { CATEGORY_NAMES } from "./species.js";

export const CHAPTERS = [
  [
    "purpose",
    "事業者・事業の目的及び内容",
    "名称、代表者、所在地、事業の種類・規模・配置・実施区域など",
  ],
  [
    "context",
    "対象区域及び周囲の概況",
    "自然的・社会的状況、既存資料、保護区域、調査範囲など",
  ],
  [
    "method",
    "項目の選定・調査、予測及び評価の手法",
    "選定・非選定理由、地点、時期、採用規格と版、予測モデル・条件など",
  ],
  [
    "results",
    "調査・予測・評価の結果",
    "実績データ、予測条件と結果、基準との比較、限界・不確実性など",
  ],
  [
    "mitigation",
    "環境保全措置",
    "回避・低減・代償措置、比較検討、実施責任者・効果と不確実性など",
  ],
  [
    "monitoring",
    "事後調査の計画",
    "要否の判断、項目・地点・時期、異常時の対応、報告先など",
  ],
  [
    "conclusion",
    "総合評価・残された課題",
    "総合的な評価、意見の反映、未解決事項など",
  ],
];
export const safeName = (s) =>
  [...String(s).normalize("NFKC")]
    .map((c) => (c.charCodeAt(0) < 32 ? "_" : c))
    .join("")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 100) || "file";
export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = safeName(name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function sha256(data) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
const text = (v) => String(v ?? "");
const p = (v, options = {}) =>
  new Paragraph({ ...options, children: [new TextRun(text(v))] });
const lines = (value) =>
  text(value || "【未入力・要確認】")
    .split(/\r?\n/)
    .map((line) => p(line));
const heading = (v, level = HeadingLevel.HEADING_1) =>
  p(v, { heading: level, spacing: { before: 320, after: 160 } });
function table(headers, rows) {
  const widths = headers.map((_, i) =>
    i === headers.length - 1
      ? 9638 - Math.floor(9638 / headers.length) * (headers.length - 1)
      : Math.floor(9638 / headers.length),
  );
  return new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headers, ...rows].map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: r.map(
            (v, j) =>
              new TableCell({
                width: { size: widths[j], type: WidthType.DXA },
                shading:
                  i === 0 ? { fill: "E8EFEA", type: "clear" } : undefined,
                children: [p(v)],
              }),
          ),
        }),
    ),
  });
}
export async function buildReport(
  project,
  { loadFile, type = "field", generatedBy = "担当者", issues = [] } = {},
) {
  const id = uid(),
    at = now(),
    clean = Object.fromEntries(
      Object.entries(project).filter(([key]) => !key.startsWith("_")),
    );
  const snapshot = JSON.stringify(clean),
    hash = await sha256(strToU8(snapshot)),
    ts = allTasks(project);
  const label =
    {
      field: "調査記録・証拠資料報告書",
      method: "方法書 作成支援ドラフト",
      preparation: "準備書 作成支援ドラフト",
      final: "評価書 作成支援ドラフト",
    }[type] || "調査報告書";
  const body = [
    p("WILDPASS / ENVIRONMENTAL ASSESSMENT", { spacing: { after: 400 } }),
    heading(project.name),
    heading(label, HeadingLevel.HEADING_2),
    p(`事業者: ${project.client || "未入力"}`),
    ...lines(project.description),
    p(`所在地: ${project.pref || "未入力"}`),
    p(`出力日時: ${at} / 出力者: ${generatedBy}`),
    p(`報告書ID: ${id}`),
    p(`データSHA-256: ${hash}`),
    p(
      "照査用ドラフト。記載内容、適用法令・条例、提出先の様式・要求事項は責任者が確認してください。",
      { spacing: { before: 300, after: 200 } },
    ),
    heading("出力時の確認事項"),
  ];
  body.push(
    ...(issues.length
      ? issues.map((v) => p(`要確認: ${v}`))
      : [
          p(
            "アプリ内の確認項目に未完了事項はありません。法的適合や行政受理の保証を意味しません。",
          ),
        ]),
  );
  body.push(
    heading("適用法令・手続の確認"),
    ...lines(project.workspace.legal?.basis),
    p(`条例等: ${project.workspace.legal?.ordinance || "未確認"}`),
    p(`手続経路: ${project.workspace.legal?.route || "未確認"}`),
    p(`確認担当: ${project.workspace.legal?.reviewedBy || "未記録"}`),
  );
  for (const [key, title] of CHAPTERS) {
    if (
      type === "method" &&
      ["results", "mitigation", "monitoring", "conclusion"].includes(key)
    )
      continue;
    body.push(heading(title), ...lines(project.workspace.chapters?.[key]));
  }
  body.push(heading("環境項目の選定・非選定理由"));
  for (const s of project.workspace.scopes || [])
    body.push(
      heading(s.factor, HeadingLevel.HEADING_2),
      p(`${s.selected === "no" ? "非選定" : "選定"} / ${s.phase}`),
      ...lines(s.reason),
      p(`調査・予測方法: ${s.method || "未記録"}`),
      p(`基準・規格・版: ${s.standard || "未記録"}`),
    );
  body.push(heading("業務別の実施記録・照査"));
  for (const stage of projectStages(project)) {
    body.push(heading(stage.name, HeadingLevel.HEADING_2));
    for (const task of ts.filter((t) => t.stage === stage.id)) {
      body.push(
        heading(task.label, HeadingLevel.HEADING_3),
        p(
          `業務ID: ${task.id} / 状態: ${STATUS_NAMES[task.status] || task.status} / 担当: ${task.assigneeName || task.assignee || "未設定"}`,
        ),
        ...lines(task.note),
      );
      if (task.review)
        body.push(
          p(
            `照査: ${task.review.by?.name || "未記録"} / ${task.review.at} / ${task.review.reason}`,
          ),
        );
      const docs = project.documents.filter((d) => d.taskId === task.id);
      for (const comment of project.comments.filter(
        (c) => c.taskId === task.id,
      ))
        body.push(
          p(
            `担当者間の連絡: ${comment.author_name || comment.author || ""} / ${comment.created_at || comment.at || ""}`,
          ),
          ...lines(comment.body),
        );
      body.push(
        p(
          `対応資料: ${docs.map((d) => `${d.name} [${d.id}]`).join("、") || "なし"}`,
        ),
      );
    }
  }
  body.push(heading("確認種の記録"));
  for (const s of project.species_data)
    body.push(
      heading(`${s.name} / ${s.latin || "学名未確定"}`, HeadingLevel.HEADING_2),
      p(
        `記録ID: ${s.id} / 業務: ${ts.find((t) => t.id === s.taskId)?.label || "旧記録・紐づけ未確認"}`,
      ),
      p(
        `分類: ${s.type || "未入力"} / ${s.status || "UNASSESSED"} ${CATEGORY_NAMES[s.status] || ""}`,
      ),
      p(
        `出典: ${s.catalogSource || "手動・旧記録（出典未確認）"} / ${s.catalogYear || ""} / ${s.catalogId || ""}`,
      ),
      p(
        `日時: ${s.date || ""} / 地点: ${s.location || ""} / 個体数: ${s.count ?? ""}`,
      ),
      p(
        `緯度経度: ${s.latitude ?? ""}, ${s.longitude ?? ""} / 精度: ${s.accuracy ?? ""} m`,
      ),
      p(
        `記録者: ${s.recordedBy || ""} / 保護指定・許可確認: ${s.protectionNote || "未確認"}`,
      ),
      ...lines(s.notes),
    );
  body.push(
    heading("測定記録"),
    table(
      ["日時 / 地点", "項目・値・単位", "手法・校正・判定"],
      (project.workspace.measurements || []).map((m) => [
        `${m.date} / ${m.location}`,
        `${m.parameter}: ${m.value} ${m.unit}`,
        `${m.method} / ${m.calibration || ""} / ${m.assessment || "未評価"}`,
      ]),
    ),
  );
  body.push(heading("意見・対応記録"));
  for (const o of project.workspace.opinions || [])
    body.push(
      heading(`${o.subject} (${o.status})`, HeadingLevel.HEADING_2),
      p(`${o.date} / ${o.source} / 担当 ${o.owner || "未設定"}`),
      ...lines(o.body),
      p(`事業者の見解: ${o.response || "未回答"}`),
      p(`反映先: ${o.reference || "未記録"}`),
    );
  body.push(
    heading("資料台帳・写真"),
    p(
      "写真（PNG/JPEG）は以下に収録します。その他の原本は「証拠一式 ZIP」の evidence フォルダーに収録します。資料ID・SHA-256で原本を照合できます。",
    ),
  );
  for (const doc of project.documents) {
    body.push(
      heading(doc.name, HeadingLevel.HEADING_2),
      p(
        `資料ID: ${doc.id} / 業務: ${ts.find((t) => t.id === doc.taskId)?.label || "紐づけ未確認"}`,
      ),
      p(
        `観察記録ID: ${doc.observationId || "なし"} / 登録: ${doc.uploadedBy || ""} ${doc.uploadedAt || ""}`,
      ),
      p(`SHA-256: ${doc.sha256 || "旧資料・未検証"}`),
      p(`原本: evidence/${doc.id}_${safeName(doc.name)}`),
    );
    if (loadFile && /image\/(png|jpeg)/.test(doc.type)) {
      const blob = await loadFile(doc),
        data = new Uint8Array(await blob.arrayBuffer());
      let width = 500,
        height = 350;
      if (typeof createImageBitmap !== "undefined") {
        const bitmap = await createImageBitmap(blob);
        height = Math.round(
          bitmap.height * Math.min(500 / bitmap.width, 620 / bitmap.height),
        );
        width = Math.round(
          bitmap.width * Math.min(500 / bitmap.width, 620 / bitmap.height),
        );
        bitmap.close();
      }
      body.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: doc.type.includes("png") ? "png" : "jpg",
              data,
              transformation: { width, height },
              altText: {
                title: doc.name,
                description: `資料 ${doc.id}`,
                name: doc.name,
              },
            }),
          ],
        }),
      );
    }
  }
  body.push(heading("出力時点の作業履歴"));
  for (const e of project.activity || [])
    body.push(
      p(`${e.at} / ${e.actor?.name || e.by || "旧記録"} / ${e.action}`),
    );
  body.push(
    p(
      "この履歴は端末で記録した操作を含みます。共有サーバーの更新履歴は同期後に履歴画面で確認してください。",
    ),
    heading("手続情報の参照元"),
    p(`確認日: ${VERIFIED_AT}`),
  );
  for (const source of SOURCES) body.push(p(`${source.title}: ${source.url}`));
  const document = new Document({
    creator: "Wildpass",
    title: `${project.name} ${label}`,
    description: `Snapshot ${hash}`,
    styles: {
      default: {
        document: {
          run: { font: "Yu Gothic", size: 20 },
          paragraph: { spacing: { after: 140, line: 300 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        headers: {
          default: new Header({
            children: [p(`${project.name} | 照査用ドラフト`)],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun("Wildpass • "),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  return {
    blob,
    snapshot,
    metadata: {
      id,
      at,
      type,
      label,
      by: generatedBy,
      sha256: hash,
      filename: `${safeName(project.name)}_${type}_${at.slice(0, 10)}.docx`,
      issues,
      documentHash: await sha256(await blob.arrayBuffer()),
    },
  };
}
export async function evidencePackage(project, report, loadFile) {
  const size = project.documents.reduce(
    (sum, d) => sum + (Number(d.size) || 0),
    0,
  );
  if (size > 200 * 1024 * 1024)
    throw new Error(
      "資料合計が200MBを超えています。端末のメモリー保護のため、個別に原本をダウンロードしてください。",
    );
  const entries = {
    [report.metadata.filename]: new Uint8Array(await report.blob.arrayBuffer()),
    "project-snapshot.json": strToU8(report.snapshot),
    "manifest.json": strToU8(
      JSON.stringify(
        { ...report.metadata, documents: project.documents },
        null,
        2,
      ),
    ),
  };
  for (const doc of project.documents)
    entries[`evidence/${doc.id}_${safeName(doc.name)}`] = new Uint8Array(
      await (await loadFile(doc)).arrayBuffer(),
    );
  return new Blob([zipSync(entries, { level: 1 })], {
    type: "application/zip",
  });
}
export async function backupZip(backup) {
  if (
    backup.files.reduce((size, f) => size + f.blob.size, 0) >
    190 * 1024 * 1024
  )
    throw new Error(
      "端末の原本が190MBを超えています。同期を完了し、案件ごとの証拠一式を保存してください。",
    );
  const entries = {},
    files = [];
  for (const f of backup.files) {
    const { blob, ...meta } = f;
    entries[`files/${f.id}`] = new Uint8Array(await blob.arrayBuffer());
    files.push({ ...meta, contentType: blob.type });
  }
  entries["backup.json"] = strToU8(
    JSON.stringify({ ...backup, files }, null, 2),
  );
  return new Blob([zipSync(entries, { level: 1 })], {
    type: "application/zip",
  });
}

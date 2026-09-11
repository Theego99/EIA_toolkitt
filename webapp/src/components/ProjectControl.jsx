import { useState } from "react";
import ReportPreview from "./ReportPreview.jsx";
import {
  Plus,
  Download,
  FileText,
  Package,
  ExternalLink,
  Check,
  History,
} from "lucide-react";
import {
  Button,
  Panel,
  Empty,
  Badge,
  Field,
  AsyncForm,
  Modal,
  Notice,
  Time,
} from "./ui.jsx";
import { MemberSelect, TaskSelect } from "./ProjectWork.jsx";
import {
  canEdit,
  uid,
  today,
  now,
  readiness,
  projectStages,
  TYPES,
} from "../domain/model.js";
import {
  SOURCES,
  VERIFIED_AT,
  LEGAL_NOTES,
  deadlineHints,
  scaleHint,
} from "../domain/legal.js";

export function LegalPanel({ project, store, profile, notify }) {
  const legal = project.workspace.legal || {},
    editable = canEdit(profile);
  const [route, setRoute] = useState(legal.route || ""),
    [period, setPeriod] = useState("2"),
    [adding, setAdding] = useState(false);
  const entry = legal.periods?.[period] || {},
    hints = deadlineHints(entry, period, route);
  return (
    <>
      <Notice>
        事業・所在地・時期に応じた適用確認を記録するための支援機能です。条例・発電所等の特例、所管機関の判断を含む法的適合を自動認定するものではありません。
      </Notice>
      <Panel
        title="適用法令と手続経路"
        subtitle="確認の根拠を残し、チームが同じ前提で進められるようにします。"
      >
        <AsyncForm
          disabled={!editable}
          onSubmit={async (v) => {
            await store.change(project.id, "適用法令の確認を更新", (p) => {
              p.workspace.legal = {
                ...p.workspace.legal,
                ...v,
                reviewedBy: profile.name,
                reviewedById: profile.id,
                reviewedAt: now(),
              };
              return p;
            });
            notify("適用確認を保存しました。");
          }}
        >
          <div className="form-grid">
            <Field label="手続経路">
              <select
                name="route"
                value={route}
                required
                onChange={(e) => setRoute(e.target.value)}
              >
                <option value="">選択してください</option>
                <option value="national-general">国法・一般手続</option>
                <option value="power">発電所（電気事業法の特例）</option>
                <option value="urban">都市計画の特例</option>
                <option value="port">港湾計画</option>
                <option value="ordinance">自治体条例</option>
                <option value="other">複数制度・適用確認中</option>
              </select>
            </Field>
            <Field label="事業区分（機関確認後）">
              <select
                name="classification"
                defaultValue={legal.classification || ""}
              >
                <option value="">未確定</option>
                <option>第一種</option>
                <option>第二種・アセス実施</option>
                <option>第二種・判定待ち</option>
                <option>条例対象</option>
                <option>その他・対象外の根拠を記録</option>
              </select>
            </Field>
          </div>
          <Field label="国法・主務省令・特例の適用根拠">
            <textarea
              name="basis"
              rows="3"
              defaultValue={legal.basis}
              required
              placeholder="事業種別・規模・変更内容、根拠条文、協議先、確認日、回答資料ID…"
            />
          </Field>
          <Field label="自治体条例・関係法令・必要な許認可">
            <textarea
              name="ordinance"
              rows="3"
              defaultValue={legal.ordinance}
              required
              placeholder="所在地の条例・技術指針、保護区域、保護種、採取等の許可、対象外とした根拠…"
            />
          </Field>
          <div className="form-grid">
            <Field
              label="発電出力（kW・参考）"
              type="number"
              name="capacity"
              min="0"
              defaultValue={legal.capacity}
            />
            <Field
              label="適用検討日"
              type="date"
              name="asOf"
              defaultValue={legal.asOf || today()}
            />
          </div>
          <p className="help-text">
            {scaleHint(project.type, legal.capacity, legal.asOf || today())}
          </p>
          {legal.reviewedAt && (
            <small>
              記録: {legal.reviewedBy} / <Time value={legal.reviewedAt} />
            </small>
          )}
        </AsyncForm>
      </Panel>
      <Panel
        title="公告・意見手続の日程"
        subtitle="公告・受領資料で確定した日付を保存します。休日・起算方法・特例を含む期限の最終確認が必要です。"
      >
        <div className="segmented">
          <button
            className={period === "2" ? "active" : ""}
            onClick={() => setPeriod("2")}
          >
            方法書
          </button>
          <button
            className={period === "4" ? "active" : ""}
            onClick={() => setPeriod("4")}
          >
            準備書
          </button>
          <button
            className={period === "5" ? "active" : ""}
            onClick={() => setPeriod("5")}
          >
            評価書
          </button>
        </div>
        <AsyncForm
          key={period}
          disabled={!editable}
          onSubmit={async (v) => {
            if (
              v.exhibitionEnd &&
              v.noticeDate &&
              v.exhibitionEnd < v.noticeDate
            )
              throw new Error("縦覧終了日は公告日以後を指定してください。");
            await store.change(
              project.id,
              "公告・意見手続の日程を更新",
              (p) => {
                p.workspace.legal.periods = {
                  ...p.workspace.legal.periods,
                  [period]: {
                    ...v,
                    confirmedBy: profile.name,
                    confirmedAt: now(),
                  },
                };
                return p;
              },
            );
            notify("日程を保存しました。");
          }}
        >
          <div className="form-grid three">
            <Field
              label="公告日"
              name="noticeDate"
              type="date"
              defaultValue={entry.noticeDate}
            />
            <Field
              label="公告に記載した縦覧終了日"
              name="exhibitionEnd"
              type="date"
              defaultValue={entry.exhibitionEnd}
            />
            <Field
              label="公告に記載した意見提出期限"
              name="opinionEnd"
              type="date"
              defaultValue={entry.opinionEnd}
            />
            <Field
              label="意見概要等を知事等が受領した日"
              name="summaryReceived"
              type="date"
              defaultValue={entry.summaryReceived}
            />
            <Field
              label="確認済みの知事等意見期限"
              name="governorEnd"
              type="date"
              defaultValue={entry.governorEnd}
            />
            <Field
              label="説明会実施日"
              name="meetingDate"
              type="date"
              defaultValue={entry.meetingDate}
            />
          </div>
          <Field
            label="公表ページURL"
            type="url"
            name="publicationUrl"
            defaultValue={entry.publicationUrl}
          />
          <Field label="公告・送達証拠、根拠、例外の確認記録">
            <textarea name="basis" rows="3" defaultValue={entry.basis} />
          </Field>
          <p className="help-text">
            {hints.monthReference
              ? `暦月の参考日: ${hints.monthReference}。`
              : "一般手続の縦覧は一月間です（固定30日ではありません）。"}
            {hints.opinionEnd &&
              ` 記録済み縦覧終了日＋14日: ${hints.opinionEnd}。`}
            {hints.governorEnd &&
              ` 記録済み受領日からの参考期限: ${hints.governorEnd}。`}
            {route !== "national-general" &&
              " 特例・条例の期限は自動計算しません。"}
          </p>
        </AsyncForm>
      </Panel>
      <Panel
        title="環境項目の選定と手法"
        subtitle="調査の必要性・非選定の理由、採用する規格を項目ごとに記録します。"
        action={
          editable && (
            <Button icon={Plus} onClick={() => setAdding({})}>
              項目を追加
            </Button>
          )
        }
      >
        {project.workspace.scopes.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>環境項目・活動</th>
                  <th>選定</th>
                  <th>理由・手法</th>
                  <th>規格・版</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {project.workspace.scopes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.factor}
                      <small>{s.phase}</small>
                    </td>
                    <td>{s.selected === "no" ? "非選定" : "選定"}</td>
                    <td>
                      {s.reason}
                      <small>{s.method}</small>
                    </td>
                    <td>{s.standard}</td>
                    <td>
                      {editable && (
                        <Button onClick={() => setAdding(s)}>編集</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="項目選定の判断を残す"
            text="大気、水、騒音、生態系、景観など、事業に応じた選定・非選定と理由を入力します。"
          />
        )}
      </Panel>
      <Panel title={`手続情報と参照資料（確認日 ${VERIFIED_AT}）`}>
        {LEGAL_NOTES.map(([title, body]) => (
          <details key={title}>
            <summary>{title}</summary>
            <p>{body}</p>
          </details>
        ))}
        <div className="source-list">
          {SOURCES.map((s) => (
            <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
              {s.title}
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      </Panel>
      {adding && (
        <Modal title="環境項目を追加" onClose={() => setAdding(false)}>
          <AsyncForm
            onSubmit={async (v) => {
              await store.change(
                project.id,
                `環境項目を選定: ${v.factor}`,
                (p) => {
                  const record = {
                    ...v,
                    id: adding.id || uid(),
                    by: profile.name,
                    at: now(),
                  };
                  p.workspace.scopes = adding.id
                    ? p.workspace.scopes.map((s) =>
                        s.id === adding.id ? record : s,
                      )
                    : [...p.workspace.scopes, record];
                  return p;
                },
              );
              setAdding(false);
            }}
          >
            <div className="form-grid">
              <Field
                label="環境項目"
                name="factor"
                defaultValue={adding.factor}
                required
                placeholder="例：鳥類・生態系"
              />
              <Field label="影響要因">
                <select name="phase" defaultValue={adding.phase}>
                  <option>工事</option>
                  <option>施設の存在</option>
                  <option>供用・運転</option>
                  <option>複数の活動</option>
                </select>
              </Field>
            </div>
            <Field label="選定">
              <select name="selected" defaultValue={adding.selected}>
                <option value="yes">選定</option>
                <option value="no">非選定</option>
              </select>
            </Field>
            <Field label="選定・非選定の理由">
              <textarea
                name="reason"
                defaultValue={adding.reason}
                required
                rows="3"
              />
            </Field>
            <Field label="調査・予測・評価の手法">
              <textarea name="method" defaultValue={adding.method} rows="3" />
            </Field>
            <Field
              label="指針・規格・版・出典"
              name="standard"
              defaultValue={adding.standard}
              required
            />
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}

export function OpinionsPanel({ project, store, profile, members, notify }) {
  const [editing, setEditing] = useState(null),
    editable = canEdit(profile);
  return (
    <>
      <Panel
        title="意見・協議と対応"
        subtitle="住民・自治体・審査機関の意見を、事業者の見解と報告書の反映先まで追跡します。"
        action={
          editable && (
            <Button icon={Plus} onClick={() => setEditing({})}>
              意見を記録
            </Button>
          )
        }
      >
        {project.workspace.opinions.length ? (
          <div className="opinion-list">
            {project.workspace.opinions.map((o) => (
              <div key={o.id}>
                <div>
                  <Badge tone={o.status === "closed" ? "green" : "amber"}>
                    {o.status === "closed" ? "対応完了" : "対応中"}
                  </Badge>
                  <small>
                    {o.date} · {o.source}
                  </small>
                </div>
                <h3>{o.subject}</h3>
                <p>{o.body}</p>
                {o.response && (
                  <blockquote>
                    <strong>事業者の見解</strong>
                    <p>{o.response}</p>
                    <small>反映先: {o.reference}</small>
                  </blockquote>
                )}
                <div className="row-between">
                  <small>
                    担当:{" "}
                    {members.find((m) => m.id === o.owner)?.name ||
                      o.owner ||
                      "未設定"}
                  </small>
                  {editable && (
                    <Button onClick={() => setEditing(o)}>対応を更新</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="意見と回答の対応関係を残す"
            text="受け取った意見、担当者、回答、反映した章・資料IDを記録します。"
          />
        )}
      </Panel>
      {editing && (
        <Modal title="意見・対応の記録" wide onClose={() => setEditing(null)}>
          <AsyncForm
            onSubmit={async (v) => {
              if (
                v.status === "closed" &&
                (!v.response.trim() || !v.reference.trim())
              )
                throw new Error(
                  "完了には回答と反映先（または対応不要の理由）が必要です。",
                );
              await store.change(
                project.id,
                `意見対応を保存: ${v.subject}`,
                (p) => {
                  const o = {
                    ...editing,
                    ...v,
                    id: editing.id || uid(),
                    updatedBy: profile.name,
                    updatedAt: now(),
                  };
                  p.workspace.opinions = editing.id
                    ? p.workspace.opinions.map((x) => (x.id === o.id ? o : x))
                    : [...p.workspace.opinions, o];
                  return p;
                },
              );
              setEditing(null);
              notify("意見対応を保存しました。");
            }}
          >
            <Field
              label="件名"
              name="subject"
              defaultValue={editing.subject}
              required
            />
            <div className="form-grid three">
              <Field
                label="受付日"
                type="date"
                name="date"
                defaultValue={editing.date || today()}
                required
              />
              <Field
                label="提出元・協議先"
                name="source"
                defaultValue={editing.source}
                required
              />
              <Field label="担当者">
                <MemberSelect
                  members={members}
                  name="owner"
                  value={editing.owner}
                />
              </Field>
            </div>
            <Field label="意見の内容">
              <textarea
                name="body"
                defaultValue={editing.body}
                rows="3"
                required
              />
            </Field>
            <Field label="事業者の見解・対応内容">
              <textarea
                name="response"
                defaultValue={editing.response}
                rows="3"
              />
            </Field>
            <Field
              label="反映先（章・資料ID・回答書など）"
              name="reference"
              defaultValue={editing.reference}
            />
            <Field label="状態">
              <select name="status" defaultValue={editing.status || "open"}>
                <option value="open">対応中</option>
                <option value="closed">対応完了</option>
              </select>
            </Field>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}

export function MeasurementsPanel({ project, store, profile, notify }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Panel
        title="測定・モニタリング"
        subtitle="値だけでなく、手法・校正・評価基準・異常時の対応を残します。"
        action={
          canEdit(profile) && (
            <Button icon={Plus} onClick={() => setAdding({})}>
              測定を記録
            </Button>
          )
        }
      >
        {project.workspace.measurements.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日時・地点</th>
                  <th>項目</th>
                  <th>結果</th>
                  <th>手法・機器</th>
                  <th>評価・対応</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {project.workspace.measurements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.date}
                      <small>{m.location}</small>
                    </td>
                    <td>{m.parameter}</td>
                    <td>
                      <strong>
                        {m.value} {m.unit}
                      </strong>
                    </td>
                    <td>
                      {m.method}
                      <small>{m.calibration}</small>
                    </td>
                    <td>{m.assessment || "未評価"}</td>
                    <td>
                      {canEdit(profile) && (
                        <Button onClick={() => setAdding(m)}>編集</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="測定結果を根拠とともに管理"
            text="騒音、水質、大気などの測定値と評価条件を記録できます。任意の数値を一律の法的合否に変換しません。"
          />
        )}
      </Panel>
      {adding && (
        <Modal
          title="測定・モニタリング記録"
          wide
          onClose={() => setAdding(false)}
        >
          <AsyncForm
            onSubmit={async (v) => {
              await store.change(
                project.id,
                `測定記録: ${v.parameter}`,
                (p) => {
                  const record = {
                    ...v,
                    id: adding.id || uid(),
                    by: profile.name,
                    at: now(),
                  };
                  p.workspace.measurements = adding.id
                    ? p.workspace.measurements.map((m) =>
                        m.id === adding.id ? record : m,
                      )
                    : [...p.workspace.measurements, record];
                  return p;
                },
              );
              setAdding(false);
              notify("測定記録を保存しました。");
            }}
          >
            <Field label="調査業務">
              <TaskSelect project={project} defaultValue={adding.taskId} />
            </Field>
            <div className="form-grid">
              <Field
                label="測定日時"
                defaultValue={adding.date}
                type="datetime-local"
                name="date"
                required
              />
              <Field
                label="地点"
                name="location"
                defaultValue={adding.location}
                required
              />
            </div>
            <div className="form-grid three">
              <Field
                label="測定項目"
                name="parameter"
                defaultValue={adding.parameter}
                placeholder="例：LAeq、pH、SS"
                required
              />
              <Field
                label="測定値（検出下限未満等も入力可）"
                name="value"
                defaultValue={adding.value}
                required
              />
              <Field
                label="単位"
                name="unit"
                defaultValue={adding.unit}
                required
              />
            </div>
            <Field
              label="手法・機器・規格の版"
              name="method"
              defaultValue={adding.method}
              required
            />
            <Field
              label="校正日・検定・品質管理"
              name="calibration"
              defaultValue={adding.calibration}
            />
            <Field label="適用基準・評価・異常時の対応">
              <textarea
                name="assessment"
                defaultValue={adding.assessment}
                rows="4"
              />
            </Field>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}

export function ReportsPanel({ project, store, profile, notify }) {
  const [type, setType] = useState("field"),
    [busy, setBusy] = useState(""),
    [chapter, setChapter] = useState("purpose"),
    [preview, setPreview] = useState(null);
  const issues = readiness(project);
  const chapters = [
    ["purpose", "事業者・事業の目的及び内容"],
    ["context", "対象区域及び周囲の概況"],
    ["method", "項目の選定・調査、予測及び評価の手法"],
    ["results", "調査・予測・評価の結果"],
    ["mitigation", "環境保全措置"],
    ["monitoring", "事後調査の計画"],
    ["conclusion", "総合評価・残された課題"],
  ];
  async function generate(zip = false) {
    if (document.querySelector('form[data-dirty="true"]')) {
      notify("入力中の本文を保存してから報告書を生成してください。", "error");
      return;
    }
    setBusy(zip ? "zip" : "docx");
    try {
      const { buildReport, evidencePackage, download } =
          await import("../domain/report.js"),
        report = await buildReport(project, {
          type,
          generatedBy: profile.name,
          loadFile: (d) => store.file(d),
          issues,
        });
      const blob = zip
        ? await evidencePackage(project, report, (d) => store.file(d))
        : report.blob;
      if (report.blob.size > 50 * 1024 * 1024)
        throw new Error(
          "Word原本が50MBを超えています。写真の容量を調整して再出力してください。",
        );
      const meta = {
        ...report.metadata,
        sha256: report.metadata.documentHash,
        snapshotHash: report.metadata.sha256,
        storage_path: `${profile.organization_id}/${project.id}/${report.metadata.id}/report.docx`,
        pending: true,
        size: report.blob.size,
        name: report.metadata.filename,
        sourceVersion: project.version,
      };
      await store.change(
        project.id,
        `報告書を出力: ${report.metadata.label}`,
        (p) => {
          p.workspace.reports.push(meta);
          return p;
        },
        [
          {
            id: meta.id,
            projectId: project.id,
            blob: report.blob,
            path: meta.storage_path,
            uploaded: false,
          },
        ],
      );
      download(
        blob,
        zip ? `${project.name}_証拠一式.zip` : report.metadata.filename,
      );
      notify("報告書を生成し、出力履歴を保存しました。");
    } catch (e) {
      notify(`報告書を出力できませんでした: ${e.message}`, "error");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="report-layout">
        <Panel
          title="報告書の作成・出力"
          subtitle="業務記録、確認種、測定結果、意見対応、写真と資料台帳を実データから編集可能なWordにまとめます。"
        >
          <Field label="出力形式">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="field">調査記録・証拠資料報告書</option>
              <option value="method">方法書 作成支援ドラフト</option>
              <option value="preparation">準備書 作成支援ドラフト</option>
              <option value="final">評価書 作成支援ドラフト</option>
            </select>
          </Field>
          <div className="report-actions">
            <Button
              variant="primary"
              icon={FileText}
              busy={busy === "docx"}
              disabled={!!busy || !canEdit(profile)}
              onClick={() => generate()}
            >
              Word報告書を生成
            </Button>
            <Button
              icon={Package}
              busy={busy === "zip"}
              disabled={!!busy || !canEdit(profile)}
              onClick={() => generate(true)}
            >
              証拠一式 ZIP
            </Button>
          </div>
          <p className="help-text">
            Word：本文・記録・PNG/JPEG写真・資料台帳。ZIP：Word＋すべての原本＋出力時データ＋照合用台帳。提出用の書式と内容は責任者が照査してください。
          </p>
        </Panel>
        <Panel
          title="出力前の確認"
          subtitle={
            issues.length
              ? `${issues.length}項目に確認が必要です。ドラフトは出力できます。`
              : "アプリ内の確認項目が完了しています。"
          }
        >
          <ul className="readiness">
            {issues.length ? (
              issues.map((i) => (
                <li key={i}>
                  <span className="dot amber" />
                  {i}
                </li>
              ))
            ) : (
              <li>
                <Check size={16} />
                確認項目の未完了なし
              </li>
            )}
          </ul>
        </Panel>
      </div>
      <Panel
        title="章ごとの本文"
        subtitle="保存した本文は次回以降も残り、出力時点の版がWordに収録されます。"
      >
        <Field label="編集する章">
          <select
            value={chapter}
            onChange={(e) => {
              if (document.querySelector('form[data-dirty="true"]')) {
                e.target.value = chapter;
                notify(
                  "編集中の本文を保存してから章を切り替えてください。",
                  "error",
                );
                return;
              }
              setChapter(e.target.value);
            }}
          >
            {chapters.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <AsyncForm
          key={chapter}
          disabled={!canEdit(profile)}
          onSubmit={async (v) => {
            await store.change(
              project.id,
              `報告書本文を更新: ${chapters.find((x) => x[0] === chapter)[1]}`,
              (p) => {
                p.workspace.chapters[chapter] = v.body;
                return p;
              },
            );
            notify("本文を保存しました。");
          }}
        >
          <Field label="本文">
            <textarea
              rows="9"
              name="body"
              defaultValue={project.workspace.chapters[chapter] || ""}
              placeholder="根拠資料・調査結果・評価内容を記入。未入力箇所は出力時に「未入力・要確認」と表示します。"
            />
          </Field>
        </AsyncForm>
      </Panel>
      <Panel
        title="出力した版"
        subtitle="過去のWord原本を保持します。出力後の編集は、過去の版を変更しません。"
      >
        {project.workspace.reports.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>出力日時</th>
                  <th>種類・担当者</th>
                  <th>版の識別</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...project.workspace.reports].reverse().map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Time value={r.at} />
                    </td>
                    <td>
                      {r.label}
                      <small>{r.by}</small>
                    </td>
                    <td>
                      <small>
                        {r.snapshotHash?.slice(0, 16)}… / v{r.sourceVersion}
                      </small>
                      <Badge tone={r.pending ? "amber" : "green"}>
                        {r.pending ? "端末保存" : "共有済み"}
                      </Badge>
                    </td>
                    <td>
                      <Button onClick={() => setPreview(r)}>表示・印刷</Button>
                      <Button
                        icon={Download}
                        onClick={async () => {
                          try {
                            const { download } =
                              await import("../domain/report.js");
                            download(await store.file(r), r.filename);
                          } catch (e) {
                            notify(e.message, "error");
                          }
                        }}
                      >
                        Word原本
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="まだ出力していません"
            text="報告書を生成すると、出力者・日時・元データの識別情報とともに保存されます。"
          />
        )}
      </Panel>
      {preview && (
        <ReportPreview
          report={preview}
          store={store}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

export function HistoryPanel({ project, store, notify }) {
  const [server, setServer] = useState(null),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Panel
        title="共有サーバーの更新履歴"
        subtitle="同期時にサーバーが記録した更新者・時刻・版です。"
        action={
          <Button
            icon={History}
            busy={busy}
            disabled={!store.client}
            onClick={async () => {
              setBusy(true);
              try {
                const { data, error } = await store.client
                  .from("workspace_audit")
                  .select("id,actor_name,recorded_at,version,action")
                  .eq("project_id", project.id)
                  .order("recorded_at", { ascending: false })
                  .limit(200);
                if (error) throw error;
                setServer(data);
              } catch (e) {
                notify(e.message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            履歴を取得
          </Button>
        }
      >
        {server ? (
          <div className="timeline">
            {server.map((e) => (
              <div key={e.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    共有版 {e.version} ·{" "}
                    {e.action === "created" ? "作成" : "更新"}
                  </strong>
                  <small>
                    {e.actor_name} · <Time value={e.recorded_at} />
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="help-text">
            オンライン時に最新200件を取得できます。デモではサーバー履歴を作成しません。
          </p>
        )}
      </Panel>
      <Panel
        title="作業の記録"
        subtitle="この端末の未同期操作を含みます。サーバーで確認された履歴は上の一覧を参照してください。"
      >
        <div className="timeline">
          {[...project.activity].reverse().map((e, i) => (
            <div key={e.id || i}>
              <span className="timeline-dot" />
              <div>
                <strong>{e.action}</strong>
                <small>
                  {e.actor?.name || e.by || "旧記録"} · <Time value={e.at} />
                </small>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function ProjectSettings({ project, store, profile, members, notify }) {
  return (
    <Panel
      title="事業情報と進行状況"
      subtitle="変更はチームに共有され、更新履歴に記録されます。"
    >
      <AsyncForm
        disabled={!canEdit(profile)}
        onSubmit={async (v) => {
          if (!v.name.trim())
            throw new Error("プロジェクト名を入力してください。");
          await store.change(project.id, "事業情報を更新", (p) => {
            Object.assign(p, {
              name: v.name.trim(),
              client: v.client,
              pref: v.pref,
              type: v.type,
              deadline: v.deadline || null,
              description: v.description,
              manager: v.manager,
            });
            p.workspace.activeStage = v.activeStage;
            return p;
          });
          notify("事業情報を保存しました。");
        }}
      >
        <Field
          label="プロジェクト名"
          name="name"
          defaultValue={project.name}
          required
          maxLength={200}
        />
        <div className="form-grid">
          <Field
            label="事業者名"
            name="client"
            defaultValue={project.client}
            required
          />
          <Field label="事業種別">
            <select name="type" defaultValue={project.type}>
              {Object.entries(TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="都道府県・市区町村"
            name="pref"
            defaultValue={project.pref}
            required
          />
          <Field
            label="社内の納品予定日"
            name="deadline"
            type="date"
            defaultValue={project.deadline || ""}
          />
          <Field label="現在の工程">
            <select
              name="activeStage"
              defaultValue={
                project.workspace.activeStage || String(project.stage)
              }
            >
              {projectStages(project).map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="責任者">
            <MemberSelect
              members={members}
              value={project.manager}
              name="manager"
            />
          </Field>
        </div>
        <Field label="事業概要">
          <textarea
            name="description"
            rows="5"
            defaultValue={project.description}
          />
        </Field>
      </AsyncForm>
    </Panel>
  );
}

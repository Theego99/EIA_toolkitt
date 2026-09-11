import { useState } from "react";
import {
  Plus,
  Paperclip,
  ChevronRight,
  Check,
  Send,
  Download,
  MapPin,
  Search,
  Bird,
  Pencil,
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
import {
  allTasks,
  projectStages,
  STATUS_NAMES,
  canEdit,
  canReview,
  taskTransition,
  uid,
  now,
  today,
} from "../domain/model.js";
import { suggestSpecies, CATEGORY_NAMES, CATALOG } from "../domain/species.js";

export function TaskSelect({
  project,
  value,
  defaultValue,
  onChange,
  name = "taskId",
  required = true,
}) {
  return (
    <select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      required={required}
    >
      <option value="">業務を選択</option>
      {allTasks(project).map((t) => (
        <option key={t.id} value={t.id}>
          {projectStages(project).find((s) => s.id === t.stage)?.name ||
            t.stage}{" "}
          / {t.label}
        </option>
      ))}
    </select>
  );
}
export function MemberSelect({ members, value, name = "assignee" }) {
  return (
    <select name={name} defaultValue={value || ""}>
      <option value="">未設定</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
export function WorkPanel({
  project,
  store,
  profile,
  members,
  notify,
  stage,
  setStage,
}) {
  const [expanded, setExpanded] = useState(""),
    [adding, setAdding] = useState(false);
  const tasks = project.tasks[stage] || [],
    editable = canEdit(profile),
    chosen = projectStages(project).find((s) => s.id === stage);
  return (
    <>
      <div className="stage-strip" aria-label="工程">
        {projectStages(project).map((s) => (
          <button
            key={s.id}
            className={stage === s.id ? "active" : ""}
            onClick={() => {
              setStage(s.id);
              setExpanded("");
            }}
          >
            <span>{s.id.padStart(2, "0")}</span>
            <strong>{s.name}</strong>
            <small>{s.short}</small>
          </button>
        ))}
      </div>
      <Panel
        title={chosen?.name || "業務"}
        subtitle={chosen?.description}
        action={
          editable && (
            <Button icon={Plus} onClick={() => setAdding(true)}>
              業務を追加
            </Button>
          )
        }
      >
        <div className="task-list">
          {tasks.length ? (
            tasks.map((task) => (
              <div
                className={`task ${expanded === task.id ? "expanded" : ""}`}
                key={task.id}
              >
                <button
                  className="task-summary"
                  onClick={() =>
                    setExpanded(expanded === task.id ? "" : task.id)
                  }
                  aria-expanded={expanded === task.id}
                >
                  <span
                    className={`task-check ${task.status === "approved" ? "checked" : ""}`}
                  >
                    {task.status === "approved" ? (
                      <Check size={15} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </span>
                  <div>
                    <strong>{task.label}</strong>
                    <small>
                      {members.find((m) => m.id === task.assignee)?.name ||
                        task.assigneeName ||
                        "担当者未設定"}
                      {task.due && ` · 期限 ${task.due}`}
                    </small>
                  </div>
                  <span className="task-files">
                    <Paperclip size={14} />
                    {
                      project.documents.filter((d) => d.taskId === task.id)
                        .length
                    }
                  </span>
                  <Badge
                    tone={
                      task.status === "approved"
                        ? "green"
                        : task.status === "returned"
                          ? "red"
                          : task.status === "review"
                            ? "amber"
                            : ""
                    }
                  >
                    {STATUS_NAMES[task.status] || task.status}
                  </Badge>
                </button>
                {expanded === task.id && (
                  <div className="task-detail">
                    <AsyncForm
                      disabled={!editable}
                      onSubmit={async (v) => {
                        await store.change(
                          project.id,
                          `業務記録を更新: ${task.label}`,
                          (p) => {
                            const t = p.tasks[stage].find(
                              (t) => t.id === task.id,
                            );
                            Object.assign(t, {
                              label: v.label.trim(),
                              note: v.note,
                              assignee: v.assignee,
                              assigneeName:
                                members.find((m) => m.id === v.assignee)
                                  ?.name || "",
                              due: v.due,
                              status: "doing",
                              done: false,
                            });
                            delete t.review;
                            return p;
                          },
                        );
                        notify("業務記録を端末に保存しました。");
                      }}
                    >
                      <Field
                        label="業務名"
                        name="label"
                        required
                        defaultValue={task.label}
                      />
                      <div className="form-grid">
                        <Field label="担当者">
                          <MemberSelect
                            members={members}
                            value={task.assignee}
                          />
                        </Field>
                        <Field
                          label="期限"
                          type="date"
                          name="due"
                          defaultValue={task.due}
                        />
                      </div>
                      <Field
                        label="実施内容・結果・判断根拠"
                        hint="変更を保存すると再照査の対象になります。"
                      >
                        <textarea
                          name="note"
                          rows="5"
                          defaultValue={task.note}
                          placeholder="実施日時、手法、結果、出典・資料ID、判断根拠、残された課題を記録…"
                        />
                      </Field>
                    </AsyncForm>
                    <div className="task-evidence">
                      <h4>この業務の証拠</h4>
                      {project.documents
                        .filter((d) => d.taskId === task.id)
                        .map((d) => (
                          <span className="evidence-chip" key={d.id}>
                            <Paperclip size={13} />
                            {d.name}
                          </span>
                        ))}
                      {editable && (
                        <label className="upload-button">
                          <Paperclip size={16} />
                          資料・写真を追加
                          <input
                            aria-label={`${task.label}に資料を添付`}
                            type="file"
                            multiple
                            onChange={async (e) => {
                              const files = [...e.target.files];
                              e.target.value = "";
                              try {
                                for (const f of files)
                                  await store.attach(project.id, task.id, f);
                                notify(
                                  `${files.length}件の資料を端末に保存しました。`,
                                );
                              } catch (err) {
                                notify(err.message, "error");
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <div className="review-bar">
                      <h4>担当者間の連絡</h4>
                      {project.comments
                        .filter((c) => c.taskId === task.id)
                        .map((c) => (
                          <div className="task-comment" key={c.id}>
                            <small>
                              {c.author_name || c.author} ·{" "}
                              <Time value={c.created_at || c.at} />
                            </small>
                            <p>{c.body}</p>
                          </div>
                        ))}
                      {editable && (
                        <AsyncForm
                          submitLabel="連絡を記録"
                          onSubmit={async (v, form) => {
                            if (!v.body.trim())
                              throw new Error("連絡内容を入力してください。");
                            await store.change(
                              project.id,
                              `業務への連絡: ${task.label}`,
                              (p) => {
                                p.comments.push({
                                  id: uid(),
                                  taskId: task.id,
                                  body: v.body,
                                  author_id: profile.id,
                                  author_name: profile.name,
                                  created_at: now(),
                                });
                                return p;
                              },
                            );
                            form.reset();
                            notify("連絡を保存しました。");
                          }}
                        >
                          <Field label="連絡・確認事項">
                            <textarea name="body" rows="2" required />
                          </Field>
                        </AsyncForm>
                      )}
                      {task.review && (
                        <p>
                          照査: {task.review.by?.name} / {task.review.reason}
                        </p>
                      )}
                      {editable &&
                        task.status !== "approved" &&
                        task.status !== "review" && (
                          <Button
                            icon={Send}
                            onClick={async () => {
                              try {
                                await store.change(
                                  project.id,
                                  `照査に提出: ${task.label}`,
                                  (p) =>
                                    taskTransition(
                                      p,
                                      task.id,
                                      "review",
                                      profile,
                                    ),
                                );
                                notify("照査待ちにしました。");
                              } catch (e) {
                                notify(e.message, "error");
                              }
                            }}
                          >
                            照査に提出
                          </Button>
                        )}
                      {canReview(profile) && task.status === "review" && (
                        <AsyncForm
                          submitLabel="照査結果を保存"
                          onSubmit={async (v) => {
                            await store.change(
                              project.id,
                              `照査結果: ${task.label}`,
                              (p) =>
                                taskTransition(
                                  p,
                                  task.id,
                                  v.result,
                                  profile,
                                  v.reason,
                                ),
                            );
                            notify("照査結果を保存しました。");
                          }}
                        >
                          <div className="form-grid">
                            <Field label="照査結果">
                              <select name="result">
                                <option value="returned">修正依頼</option>
                                <option value="approved">承認</option>
                              </select>
                            </Field>
                            <Field label="判断理由" name="reason" required />
                          </div>
                        </AsyncForm>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <Empty
              title="業務を追加してください"
              text="担当者、期限、実施記録と証拠をひとつの業務で管理できます。"
            />
          )}
        </div>
      </Panel>
      {adding && (
        <Modal title="業務を追加" onClose={() => setAdding(false)}>
          <AsyncForm
            onSubmit={async (v) => {
              await store.change(project.id, `業務追加: ${v.label}`, (p) => {
                p.tasks[stage] = [
                  ...(p.tasks[stage] || []),
                  {
                    id: uid(),
                    stage,
                    label: v.label,
                    note: v.note,
                    status: "todo",
                    assignee: v.assignee,
                    due: v.due,
                  },
                ];
                return p;
              });
              setAdding(false);
              notify("業務を追加しました。");
            }}
          >
            <Field label="業務名" name="label" required maxLength={200} />
            <div className="form-grid">
              <Field label="担当者">
                <MemberSelect members={members} />
              </Field>
              <Field label="期限" name="due" type="date" />
            </div>
            <Field label="実施内容">
              <textarea name="note" rows="4" />
            </Field>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}

function SpeciesInput({ initial, select }) {
  const [query, setQuery] = useState(initial?.name || ""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const options = suggestSpecies(query);
  function choose(s) {
    setQuery(s.name);
    setOpen(false);
    setActive(-1);
    select(s);
  }
  return (
    <div className="autocomplete">
      <input
        name="name"
        required
        role="combobox"
        aria-label="種名"
        aria-expanded={open && options.length > 0}
        aria-controls="species-options"
        aria-autocomplete="list"
        aria-activedescendant={
          active >= 0 ? `species-option-${active}` : undefined
        }
        value={query}
        autoComplete="off"
        placeholder="和名・学名を入力（例：おおたか）"
        onChange={(e) => {
          setQuery(e.target.value);
          select(null);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((n) => Math.min(n + 1, options.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((n) => Math.max(n - 1, 0));
          }
          if (e.key === "Enter" && open && active >= 0) {
            e.preventDefault();
            choose(options[active]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && query && (
        <div id="species-options" role="listbox" className="suggestions">
          {options.length ? (
            options.map((s, i) => (
              <div
                key={s.id}
                id={`species-option-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
              >
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.latin}</small>
                </div>
                <span>
                  {s.status}
                  <small>
                    {s.type} · {s.year}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <p>該当候補なし。未同定・収録外の種も記録できます。</p>
          )}
        </div>
      )}
    </div>
  );
}
export function ObservationsPanel({ project, store, profile, notify }) {
  const [editing, setEditing] = useState(null),
    [selected, setSelected] = useState(null),
    [filter, setFilter] = useState(""),
    [gps, setGps] = useState(null),
    [locating, setLocating] = useState(false);
  const observations = project.species_data.filter((s) =>
    `${s.name} ${s.latin} ${s.location}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const editable = canEdit(profile);
  function open(s) {
    setEditing(s || {});
    setSelected(
      s?.catalogId
        ? {
            id: s.catalogId,
            name: s.name,
            latin: s.latin,
            type: s.type,
            status: s.status,
            year: s.catalogYear,
            source: s.catalogSource,
          }
        : null,
    );
    setGps(
      s?.latitude
        ? { latitude: s.latitude, longitude: s.longitude, accuracy: s.accuracy }
        : null,
    );
  }
  return (
    <>
      <Panel
        title="生物の観察記録"
        subtitle="種・位置・日時・記録者と証拠を、調査業務に結び付けます。"
        action={
          editable && (
            <Button variant="primary" icon={Plus} onClick={() => open()}>
              観察を記録
            </Button>
          )
        }
      >
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="観察を検索"
              placeholder="種名・学名・地点を検索"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <span>{observations.length} 件</span>
        </div>
        {observations.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>確認種</th>
                  <th>カテゴリー・出典</th>
                  <th>日時・地点</th>
                  <th>記録者</th>
                  <th>資料</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {observations.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <small>
                        <i>{s.latin || "学名未確定"}</i>
                      </small>
                      <small>
                        {s.type} · {s.count ?? "未記録"} 個体
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          ["CR", "EN", "VU", "CR+EN"].includes(s.status)
                            ? "amber"
                            : ""
                        }
                      >
                        {s.status || "未照合"}
                      </Badge>
                      <small>
                        {s.catalogYear
                          ? `環境省 ${s.catalogYear}`
                          : "出典未確認"}
                      </small>
                    </td>
                    <td>
                      {s.date || "日時未記録"}
                      <small>{s.location || "地点未記録"}</small>
                    </td>
                    <td>{s.recordedBy || "未記録"}</td>
                    <td>
                      {
                        project.documents.filter(
                          (d) => d.observationId === s.id,
                        ).length
                      }
                    </td>
                    <td>
                      {editable && (
                        <Button
                          icon={Pencil}
                          variant="quiet"
                          onClick={() => open(s)}
                        >
                          編集
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="現場の発見を記録する"
            text="種名の候補を選び、調査業務・地点・確認数を入力してください。"
            action={
              editable && (
                <Button icon={Bird} onClick={() => open()}>
                  最初の観察を記録
                </Button>
              )
            }
          />
        )}
      </Panel>
      <p className="help-text">
        収録 {CATALOG.entries.length.toLocaleString()} レコード /{" "}
        {CATALOG.sources.length}{" "}
        資料。収録外の種は低懸念（LC）と判定しません。都道府県リスト・保護指定・採取許可は別途確認します。
      </p>
      {editing && (
        <Modal
          title={editing.id ? "観察記録を編集" : "現場の観察を記録"}
          wide
          onClose={() => setEditing(null)}
        >
          <AsyncForm
            submitLabel="観察を保存"
            onSubmit={async (v, form) => {
              const count = Number(v.count);
              if (
                !Number.isFinite(count) ||
                count < 0 ||
                !Number.isInteger(count)
              )
                throw new Error("個体数は0以上の整数で入力してください。");
              const id = editing.id || uid(),
                files = [...form.elements.photos.files];
              await store.change(
                project.id,
                `${editing.id ? "観察修正" : "観察追加"}: ${v.name}`,
                (p) => {
                  const s = {
                    ...editing,
                    id,
                    name: v.name.trim(),
                    latin: selected?.latin || v.latin,
                    type: selected?.type || v.type,
                    status: selected?.status || "UNASSESSED",
                    catalogId: selected?.id || null,
                    catalogYear: selected?.year || null,
                    catalogSource: selected?.source || null,
                    taskId: v.taskId,
                    count,
                    location: v.location,
                    date: v.date,
                    notes: v.notes,
                    protectionNote: v.protectionNote,
                    ...gps,
                    recordedBy: editing.recordedBy || profile.name,
                    recordedById: editing.recordedById || profile.id,
                    recordedAt: editing.recordedAt || now(),
                    updatedBy: profile.name,
                    updatedAt: now(),
                  };
                  p.species_data = editing.id
                    ? p.species_data.map((x) => (x.id === id ? s : x))
                    : [...p.species_data, s];
                  for (const tasks of Object.values(p.tasks))
                    for (const t of tasks)
                      if (
                        [v.taskId, editing.taskId].includes(t.id) &&
                        t.status === "approved"
                      ) {
                        t.status = "doing";
                        t.done = false;
                        delete t.review;
                      }
                  return p;
                },
              );
              let failed = [];
              for (const file of files) {
                try {
                  await store.attach(project.id, v.taskId, file, id);
                } catch (e) {
                  failed.push(`${file.name}: ${e.message}`);
                }
              }
              if (failed.length) {
                setEditing({ ...editing, id });
                throw new Error(
                  `観察は保存済みです。一部の添付に失敗しました。失敗分を選び直してください: ${failed.join(" / ")}`,
                );
              }
              setEditing(null);
              notify("観察と添付を端末に保存しました。");
            }}
          >
            <Field label="紐づける調査業務">
              <TaskSelect
                project={project}
                defaultValue={editing.taskId || ""}
              />
            </Field>
            <Field label="種名">
              <SpeciesInput initial={editing} select={setSelected} />
            </Field>
            {selected ? (
              <div className="species-match">
                <Badge tone="green">候補を選択済み</Badge>
                <strong>
                  {selected.status} · {CATEGORY_NAMES[selected.status]}
                </strong>
                <small>
                  {selected.latin} / {selected.type} / {selected.source}
                </small>
              </div>
            ) : (
              <div className="form-grid">
                <Field
                  label="学名（判明している場合）"
                  name="latin"
                  defaultValue={editing.latin}
                />
                <Field
                  label="分類群"
                  name="type"
                  defaultValue={editing.type}
                  placeholder="鳥類・昆虫類・植物など"
                />
              </div>
            )}
            <div className="form-grid three">
              <Field
                label="確認日"
                type="date"
                name="date"
                defaultValue={editing.date || today()}
                required
              />
              <Field
                label="個体数"
                type="number"
                name="count"
                min="0"
                step="1"
                defaultValue={editing.count ?? 1}
                required
              />
              <Field
                label="調査地点"
                name="location"
                defaultValue={editing.location}
                placeholder="地点番号・ルート名"
                required
              />
            </div>
            <div className="gps-row">
              <Button
                type="button"
                icon={MapPin}
                busy={locating}
                onClick={() => {
                  if (!navigator.geolocation) {
                    notify("この端末は位置取得に対応していません。", "error");
                    return;
                  }
                  setLocating(true);
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setGps({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: Math.round(pos.coords.accuracy),
                      });
                      setLocating(false);
                    },
                    (err) => {
                      notify(`位置を取得できません: ${err.message}`, "error");
                      setLocating(false);
                    },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                  );
                }}
              >
                現在位置を取得
              </Button>
              <small>
                {gps
                  ? `${Number(gps.latitude).toFixed(6)}, ${Number(gps.longitude).toFixed(6)} / 精度 ±${gps.accuracy}m`
                  : "位置は手動の地点名でも記録できます。"}
              </small>
            </div>
            <Field label="観察内容・同定根拠・行動">
              <textarea
                name="notes"
                rows="3"
                defaultValue={editing.notes}
                required
              />
            </Field>
            <Field
              label="保護指定・許可・都道府県リストの確認"
              name="protectionNote"
              defaultValue={editing.protectionNote}
              placeholder="根拠資料、確認日、許可番号、要確認事項など"
            />
            <Field label="写真・資料（複数可・1件50MBまで）">
              <input type="file" name="photos" multiple />
            </Field>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}

export function EvidencePanel({ project, store, profile, notify }) {
  const [taskId, setTaskId] = useState(""),
    [busy, setBusy] = useState(false);
  const docs = project.documents.filter((d) => !taskId || d.taskId === taskId);
  async function downloadDoc(doc) {
    try {
      setBusy(true);
      const { download } = await import("../domain/report.js");
      download(await store.file(doc), doc.name);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Panel
        title="証拠資料"
        subtitle="すべての資料を業務に紐づけます。写真は報告書に収録し、文書の原本は証拠一式ZIPに含めます。"
      >
        <div className="table-toolbar">
          <TaskSelect
            project={project}
            required={false}
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
          {canEdit(profile) && (
            <label className={`upload-button ${!taskId ? "disabled" : ""}`}>
              <Plus size={16} />
              資料を追加
              <input
                aria-label="証拠資料を追加"
                type="file"
                disabled={!taskId || busy}
                multiple
                onChange={async (e) => {
                  const files = [...e.target.files];
                  e.target.value = "";
                  setBusy(true);
                  try {
                    for (const f of files)
                      await store.attach(project.id, taskId, f);
                    notify(`${files.length}件を保存しました。`);
                  } catch (err) {
                    notify(err.message, "error");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          )}
        </div>
        {!taskId && (
          <p className="help-text">
            追加する前に、紐づける業務を選択してください。
          </p>
        )}
        {docs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>原本</th>
                  <th>紐づく業務</th>
                  <th>登録者・日時</th>
                  <th>保存状況</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.name}</strong>
                      <small>
                        {typeof d.size === "number"
                          ? `${(d.size / 1024).toFixed(0)} KB`
                          : d.size}{" "}
                        ·{" "}
                        {d.sha256
                          ? `SHA-256 ${d.sha256.slice(0, 12)}…`
                          : "旧資料・要検証"}
                      </small>
                      <small>資料ID: {d.id}</small>
                    </td>
                    <td>
                      {allTasks(project).find((t) => t.id === d.taskId)
                        ?.label || <Badge tone="amber">紐づけ未確認</Badge>}
                      {!d.taskId && canEdit(profile) && (
                        <select
                          aria-label={`${d.name}の業務`}
                          value=""
                          onChange={async (e) => {
                            const id = e.target.value;
                            if (!id) return;
                            await store.change(
                              project.id,
                              `旧資料を業務に紐づけ: ${d.name}`,
                              (p) => {
                                const doc = p.documents.find(
                                  (x) => x.id === d.id,
                                );
                                doc.taskId = id;
                                doc.stage = allTasks(p).find(
                                  (t) => t.id === id,
                                )?.stage;
                                return p;
                              },
                            );
                            notify("紐づけを保存しました。");
                          }}
                        >
                          <option value="">業務を指定</option>
                          {allTasks(project).map((t) => (
                            <option value={t.id} key={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {d.uploadedBy || "未記録"}
                      <small>
                        <Time value={d.uploadedAt} />
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          d.pending
                            ? "amber"
                            : d.storage_path
                              ? "green"
                              : "amber"
                        }
                      >
                        {d.pending
                          ? "端末保存・同期待ち"
                          : d.storage_path
                            ? "共有済み"
                            : "旧資料・所在確認"}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        busy={busy}
                        icon={Download}
                        variant="quiet"
                        onClick={() => downloadDoc(d)}
                      >
                        原本
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="証拠を業務につなげる"
            text="調査写真、測定結果、協議の記録、提出書類などを追加してください。"
          />
        )}
      </Panel>
      <Notice>
        資料の原本は上書きしません。修正版は新しい資料として追加してください。端末のデータ消去に備え、共有同期とバックアップを確認してください。
      </Notice>
    </>
  );
}

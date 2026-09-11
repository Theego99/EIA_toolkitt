export const STAGES = [
  {
    id: "1",
    name: "配慮書",
    short: "計画・適用確認",
    description: "事業の適用法令、代替案、関係機関との協議を記録します。",
  },
  {
    id: "2",
    name: "方法書",
    short: "調査を設計",
    description: "選定項目と調査方法を決め、公告・意見対応を管理します。",
  },
  {
    id: "3",
    name: "調査・予測・評価",
    short: "現場から証拠へ",
    description: "観察・測定・写真を調査業務に結び付け、担当者が確認します。",
  },
  {
    id: "4",
    name: "準備書",
    short: "結果・保全措置",
    description: "結果、予測の不確実性、保全措置と意見対応をまとめます。",
  },
  {
    id: "5",
    name: "評価書",
    short: "審査・確定",
    description: "意見を反映した版、審査書類、公告を保存します。",
  },
  {
    id: "6",
    name: "事後調査",
    short: "継続モニタリング",
    description: "事後調査の要否と計画、測定結果、異常時の対応を記録します。",
  },
];
export const TYPES = {
  wind: "風力発電",
  solar: "太陽光発電",
  thermal: "火力発電",
  hydro: "水力発電",
  geothermal: "地熱発電",
  nuclear: "原子力発電",
  road: "道路",
  river: "河川・ダム",
  railway: "鉄道・軌道",
  airport: "飛行場",
  waste: "廃棄物最終処分場",
  reclamation: "埋立て・干拓",
  land: "面開発",
  port: "港湾計画",
  other: "その他",
};
export const ROLE_NAMES = {
  admin: "管理者",
  pm: "プロジェクト責任者",
  surveyor: "調査担当",
  author: "報告書担当",
  reviewer: "照査担当",
  client: "閲覧のみ",
};
export const STATUS_NAMES = {
  todo: "未着手",
  doing: "作業中",
  review: "照査待ち",
  approved: "照査済み",
  returned: "要修正",
};
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const canEdit = (profile) =>
  ["admin", "pm", "surveyor", "author", "reviewer"].includes(profile?.role);
export const canReview = (profile) =>
  ["admin", "pm", "reviewer"].includes(profile?.role);
export const actor = (profile) => ({
  id: profile.id,
  name: profile.name || profile.email || "担当者",
});

const DEFAULT_TASKS = {
  1: [
    "適用法令・条例と手続経路の確認",
    "複数案の比較と環境配慮",
    "関係機関との協議・意見の記録",
  ],
  2: [
    "環境項目の選定と理由",
    "調査地点・時期・手法の計画",
    "方法書の公告・縦覧・説明会・意見対応",
  ],
  3: [
    "動植物・生態系の現地調査",
    "水質・水文の調査",
    "騒音・振動・大気等の調査",
    "予測モデル・入力条件・結果の照査",
  ],
  4: [
    "環境影響の評価と不確実性",
    "回避・低減・代償措置の検討",
    "準備書の公告・縦覧・説明会・意見対応",
  ],
  5: ["意見への対応と最終版の照査", "審査・補正・公告の記録"],
  6: ["事後調査の要否・実施計画", "モニタリング・異常時の対応・報告"],
};
export function newProject(input, profile) {
  return {
    id: uid(),
    organization_id: profile.organization_id,
    name: input.name.trim(),
    client: input.client || "",
    type: input.type || "wind",
    pref: input.pref || "",
    deadline: input.deadline || null,
    description: input.description || "",
    stage: 1,
    version: 0,
    tasks: Object.fromEntries(
      Object.entries(DEFAULT_TASKS).map(([stage, labels]) => [
        stage,
        labels.map((label) => ({
          id: uid(),
          label,
          status: "todo",
          note: "",
          assignee: "",
          due: "",
          stage,
        })),
      ]),
    ),
    species_data: [],
    documents: [],
    comments: [],
    activity: [],
    workspace: {
      schema: 1,
      legal: {},
      chapters: {},
      opinions: [],
      measurements: [],
      scopes: [],
      reports: [],
    },
    created_at: now(),
    updated_at: now(),
  };
}
export function normalizeProject(row) {
  const tasks = Object.fromEntries(
    Object.entries(row.tasks || {}).map(([stage, values]) => [
      stage,
      (Array.isArray(values) ? values : []).map((t, i) => ({
        ...t,
        id: String(t.id || `${stage}-${i}`),
        stage,
        status: t.status || (t.done ? "doing" : "todo"),
        legacyCompleted: t.legacyCompleted || (!t.status && !!t.done),
        done: t.status === "approved",
        note: t.note || "",
        assignee: t.assignee || "",
      })),
    ]),
  );
  return {
    ...row,
    description: row.description || row.desc || "",
    custom_stages: row.custom_stages || row.customStages || null,
    updated_at:
      row.updated_at ||
      (row._updatedAt ? new Date(row._updatedAt).toISOString() : now()),
    tasks,
    version: row.version || 0,
    species_data: row.species_data || row.species || [],
    documents: row.documents || [],
    comments: row.comments || [],
    activity: row.activity || [],
    workspace: {
      schema: 1,
      legal: {},
      chapters: {},
      opinions: [],
      measurements: [],
      scopes: [],
      reports: [],
      ...row.workspace,
    },
  };
}
export function projectStages(project) {
  const custom = project.custom_stages || project.customStages;
  const stages =
    Array.isArray(custom) && custom.length
      ? custom.map((s) => ({
          id: String(s.id),
          name: s.name || s.label || s.short || `工程 ${s.id}`,
          short: s.short || "プロジェクトの工程",
          description:
            "このプロジェクトで設定した工程です。実施内容と根拠資料を記録してください。",
        }))
      : STAGES;
  return [
    ...stages,
    ...Object.keys(project.tasks || {})
      .filter((id) => !stages.some((s) => s.id === id))
      .map((id) => ({
        id,
        name: `追加工程 ${id}`,
        short: "既存の業務",
        description: "既存のプロジェクトで設定した追加工程です。",
      })),
  ];
}
export const allTasks = (p) =>
  Object.entries(p.tasks || {}).flatMap(([stage, list]) =>
    list.map((t) => ({ ...t, stage })),
  );
export const progress = (p) => {
  const ts = allTasks(p);
  return ts.length
    ? Math.round(
        (ts.filter((t) => t.status === "approved").length / ts.length) * 100,
      )
    : 0;
};
export function recordChange(project, profile, action, transform) {
  if (!canEdit(profile)) throw new Error("このアカウントは閲覧専用です。");
  const next = transform(structuredClone(project));
  for (const before of allTasks(project)) {
    if (!["approved", "review"].includes(before.status)) continue;
    const after = Object.values(next.tasks)
      .flat()
      .find((t) => t.id === before.id);
    if (!after) continue;
    const linked = (p) =>
      JSON.stringify([
        p.documents.filter((d) => d.taskId === before.id),
        p.species_data.filter((s) => s.taskId === before.id),
        (p.workspace.measurements || []).filter((m) => m.taskId === before.id),
      ]);
    if (
      before.note !== after.note ||
      before.label !== after.label ||
      linked(project) !== linked(next)
    ) {
      after.status = "doing";
      after.done = false;
      delete after.review;
    }
  }
  if (
    next.id !== project.id ||
    next.organization_id !== profile.organization_id
  )
    throw new Error("組織またはプロジェクトが一致しません。");
  const at = now();
  return {
    ...next,
    updated_at: at,
    activity: [
      ...(project.activity || []),
      { id: uid(), at, actor: actor(profile), action },
    ],
  };
}
export function taskTransition(project, taskId, status, profile, reason = "") {
  return recordChange(
    project,
    profile,
    `業務状態: ${STATUS_NAMES[status]}${reason ? ` / ${reason}` : ""}`,
    (p) => {
      for (const tasks of Object.values(p.tasks)) {
        const t = tasks.find((t) => t.id === taskId);
        if (!t) continue;
        if (!(status in STATUS_NAMES)) throw new Error("無効な状態です。");
        if (["approved", "returned"].includes(status)) {
          if (!canReview(profile))
            throw new Error("照査担当者の権限が必要です。");
          if (!reason.trim())
            throw new Error("照査結果・判断理由を入力してください。");
          if (status === "approved" && t.status !== "review")
            throw new Error("まず照査に提出してください。");
          if (status === "approved" && t.submittedBy === profile.id)
            throw new Error("提出者以外の照査担当者が承認してください。");
          t.review = { by: actor(profile), at: now(), reason };
        }
        if (status === "review") {
          if (!t.note?.trim())
            throw new Error(
              "結果・判断根拠を記録してから照査に提出してください。",
            );
          t.submittedBy = profile.id;
          t.submittedAt = now();
        }
        t.status = status;
        t.done = status === "approved";
        return p;
      }
      throw new Error("業務が見つかりません。");
    },
  );
}

// Three-way merge keeps independent offline edits, including array entries identified by id.
// A simultaneous edit to the same value stops sync; both complete versions remain available.
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function mergeProjects(base, local, remote) {
  const conflicts = [];
  function merge(b, l, r, path) {
    if (equal(l, r)) return l;
    if (equal(b, l)) return r;
    if (equal(b, r)) return l;
    if (["version", "updated_at"].includes(path)) return r;
    const array = [b, l, r].every(
      (x) =>
        Array.isArray(x) &&
        x.every((v) => v && typeof v === "object" && v.id !== undefined),
    );
    if (array) {
      const maps = [b, l, r].map(
        (v) => new Map(v.map((x) => [String(x.id), x])),
      );
      return [...new Set([...b, ...l, ...r].map((x) => String(x.id)))]
        .map((id) => merge(...maps.map((m) => m.get(id)), `${path}[${id}]`))
        .filter((v) => v !== undefined);
    }
    if (
      [b, l, r].every((x) => x && typeof x === "object" && !Array.isArray(x))
    ) {
      return Object.fromEntries(
        [...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])]
          .map((k) => [k, merge(b[k], l[k], r[k], path ? `${path}.${k}` : k)])
          .filter(([, v]) => v !== undefined),
      );
    }
    conflicts.push(path);
    return l;
  }
  return { value: merge(base, local, remote, ""), conflicts };
}
export function readiness(project) {
  const issues = [],
    legal = project.workspace.legal || {},
    ts = allTasks(project);
  if (
    !legal.reviewedBy ||
    !legal.basis?.trim() ||
    !legal.ordinance?.trim() ||
    !legal.route
  )
    issues.push("適用法令・条例・手続経路の確認が未記録");
  if (!project.client) issues.push("事業者名が未入力");
  if (!project.pref) issues.push("所在地が未入力");
  if (ts.some((t) => t.status !== "approved"))
    issues.push(
      `未照査の業務 ${ts.filter((t) => t.status !== "approved").length} 件`,
    );
  if ((project.workspace.opinions || []).some((o) => o.status !== "closed"))
    issues.push("未完了の意見対応あり");
  if (
    (project.documents || []).some(
      (d) => d.pending || (d.uploadId && !d.storage_path),
    )
  )
    issues.push("未同期・所在未確認の添付資料あり");
  if ((project.documents || []).some((d) => !d.taskId))
    issues.push("業務に紐づいていない旧添付資料あり");
  const missingChapters = [
    "purpose",
    "context",
    "method",
    "results",
    "mitigation",
    "monitoring",
    "conclusion",
  ].filter((key) => !project.workspace.chapters?.[key]?.trim());
  if (missingChapters.length)
    issues.push(
      `報告書の本文が未入力 ${missingChapters.length} 章（対象外の場合も理由を記録）`,
    );
  if (!(project.workspace.scopes || []).length)
    issues.push("環境項目の選定理由が未記録");
  return issues;
}

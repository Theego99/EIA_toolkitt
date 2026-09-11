import { useEffect, useRef, useState } from "react";
import {
  Leaf,
  LayoutDashboard,
  FolderKanban,
  Users,
  Cloud,
  CloudOff,
  ArrowUpRight,
  Plus,
  Search,
  ChevronRight,
  CheckCircle2,
  Clock3,
  CircleAlert,
  Download,
  RefreshCw,
  LogOut,
  Settings2,
  FileText,
  X,
  MapPin,
  ClipboardList,
  Bird,
  Paperclip,
  Scale,
  MessagesSquare,
  Activity,
  History,
  Menu,
} from "lucide-react";
import { supabase } from "./lib/supabase.js";
import { promptInstall } from "./lib/pwa.js";
import { Workspace } from "./data/workspace.js";
import {
  newProject,
  allTasks,
  progress,
  TYPES,
  ROLE_NAMES,
  canEdit,
  today,
  now,
} from "./domain/model.js";
import Auth from "./components/Auth.jsx";
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
} from "./components/ui.jsx";
import {
  WorkPanel,
  ObservationsPanel,
  EvidencePanel,
} from "./components/ProjectWork.jsx";
import {
  LegalPanel,
  OpinionsPanel,
  MeasurementsPanel,
  ReportsPanel,
  HistoryPanel,
  ProjectSettings,
} from "./components/ProjectControl.jsx";
import "./workspace.css";

const DEMO = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  name: "佐藤（デモ調査担当）",
  role: "pm",
  demo: true,
};
const DEMO_REVIEWER = {
  ...DEMO,
  id: "33333333-3333-4333-8333-333333333333",
  name: "田中（デモ照査担当）",
  role: "reviewer",
};
const timeout = (promise, ms = 12000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "接続がタイムアウトしました。通信状態を確認して再試行してください。",
            ),
          ),
        ms,
      ),
    ),
  ]);
const tabs = [
  ["work", "工程・業務", ClipboardList],
  ["observations", "生物記録", Bird],
  ["measurements", "測定記録", Activity],
  ["evidence", "証拠資料", Paperclip],
  ["legal", "法令・手続", Scale],
  ["opinions", "意見対応", MessagesSquare],
  ["reports", "報告書", FileText],
  ["history", "履歴", History],
  ["settings", "事業情報", Settings2],
];

export default function WorkspaceApp() {
  const [identity, setIdentity] = useState(null),
    [loading, setLoading] = useState(true),
    [authError, setAuthError] = useState(""),
    [recovering, setRecovering] = useState(false),
    [demoActor, setDemoActor] = useState(DEMO);
  const [store, setStore] = useState(null),
    [projects, setProjects] = useState([]),
    [members, setMembers] = useState([]),
    [org, setOrg] = useState("ワークスペース");
  const [page, setPage] = useState("dashboard"),
    [projectId, setProjectId] = useState(""),
    [tab, setTab] = useState("work"),
    [stage, setStage] = useState("3"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [create, setCreate] = useState(false);
  const [toast, setToast] = useState(null),
    [online, setOnline] = useState(navigator.onLine),
    [syncing, setSyncing] = useState(false),
    [syncError, setSyncError] = useState(""),
    [lastSync, setLastSync] = useState(""),
    [mobile, setMobile] = useState(false),
    [swUpdate, setSwUpdate] = useState(false);
  const authEpoch = useRef(0),
    toastTimer = useRef(),
    storeRef = useRef(null),
    syncRef = useRef(false);
  function notify(message, tone = "success") {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast(null),
      tone === "error" ? 12000 : 5000,
    );
  }
  async function acceptSession(session) {
    const epoch = ++authEpoch.current;
    if (!session) {
      setIdentity(null);
      setLoading(false);
      return;
    }
    try {
      let profile;
      if (navigator.onLine) {
        const { data, error } = await timeout(
          supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single(),
        );
        if (error) throw error;
        profile = data;
        localStorage.setItem(
          `wildpass-profile:${session.user.id}`,
          JSON.stringify(profile),
        );
      } else
        profile = JSON.parse(
          localStorage.getItem(`wildpass-profile:${session.user.id}`) || "null",
        );
      if (!profile?.organization_id)
        throw new Error(
          "組織への参加情報を取得できません。オンラインでログインし、管理者に参加状況を確認してください。",
        );
      if (epoch === authEpoch.current) {
        localStorage.setItem("wildpass-last-user", session.user.id);
        const next = { ...profile, email: session.user.email };
        setIdentity((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
        setAuthError("");
      }
    } catch (e) {
      if (epoch === authEpoch.current) {
        setIdentity(null);
        setAuthError(e.message);
      }
    } finally {
      if (epoch === authEpoch.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1")
      sessionStorage.setItem("wildpass-demo", "yes");
    if (sessionStorage.getItem("wildpass-demo") === "yes") {
      setIdentity(DEMO);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setLoading(false);
      return;
    }
    let restoredOffline = false;
    if (!navigator.onLine) {
      const last = localStorage.getItem("wildpass-last-user"),
        cached =
          last &&
          JSON.parse(
            localStorage.getItem(`wildpass-profile:${last}`) || "null",
          );
      if (cached?.id === last && cached.organization_id) {
        setIdentity(cached);
        setLoading(false);
        restoredOffline = true;
      }
    }
    if (!restoredOffline)
      timeout(supabase.auth.getSession())
        .then(({ data, error }) => {
          if (error) throw error;
          return acceptSession(data.session);
        })
        .catch((e) => {
          setAuthError(e.message);
          setLoading(false);
        });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (
        [
          "SIGNED_IN",
          "SIGNED_OUT",
          "PASSWORD_RECOVERY",
          "USER_UPDATED",
          "TOKEN_REFRESHED",
        ].includes(event) &&
        sessionStorage.getItem("wildpass-demo") !== "yes"
      )
        setTimeout(() => acceptSession(session), 0);
    });
    const invalidate = () => {
      authEpoch.current++;
    };
    return () => {
      invalidate();
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false),
      update = () => setSwUpdate(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("sw-update-available", update);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("sw-update-available", update);
    };
  }, []);
  useEffect(() => {
    const guard = (e) => {
      const target = e.target.closest?.(
        ".project-tabs button,.stage-strip button,.task-summary,.sidebar nav button,.brand,.text-button,.project-card,.segmented button,[data-navigation]",
      );
      if (target && document.querySelector('form[data-dirty="true"]')) {
        e.preventDefault();
        e.stopPropagation();
        notify("入力中の変更を保存してから画面を切り替えてください。", "error");
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, []);
  useEffect(() => {
    if (!identity) {
      setStore(null);
      storeRef.current = null;
      setProjects([]);
      return;
    }
    let alive = true;
    const workspace = new Workspace(identity, identity.demo ? null : supabase);
    storeRef.current = workspace;
    setStore(workspace);
    setMembers(identity.demo ? [DEMO, DEMO_REVIEWER] : [identity]);
    setOrg(identity.demo ? "デモ環境 · サンプル株式会社" : "ワークスペース");
    const reload = () =>
      workspace
        .list()
        .then((data) => {
          if (alive) setProjects(data);
        })
        .catch((e) => {
          if (alive)
            notify(`端末データを読み込めません: ${e.message}`, "error");
        });
    const unsubscribe = workspace.subscribe(reload);
    (async () => {
      if (identity.demo && !(await workspace.list()).length) {
        const p = newProject(
          {
            name: "北信州 風力発電計画",
            client: "サンプルエナジー株式会社（デモ）",
            pref: "長野県",
            type: "wind",
            description:
              "デモ用の架空案件です。調査から報告までの流れを試せます。",
            deadline: "2026-12-18",
          },
          DEMO,
        );
        p.stage = 3;
        p.tasks["3"][0] = {
          ...p.tasks["3"][0],
          assignee: DEMO.id,
          assigneeName: DEMO.name,
          status: "doing",
          note: "【デモ】秋季の鳥類調査を計画中。調査地点と観察結果を記録してください。",
        };
        await workspace.create(p);
      }
      await reload();
      const cachedTeam = await workspace.metadata("team");
      if (alive && cachedTeam?.length) setMembers(cachedTeam);
      if (!identity.demo && navigator.onLine) {
        const results = await Promise.allSettled([
          supabase
            .from("profiles")
            .select("id,name,role,organization_id")
            .eq("organization_id", identity.organization_id),
          supabase
            .from("organizations")
            .select("name")
            .eq("id", identity.organization_id)
            .single(),
        ]);
        if (alive) {
          const team = results[0],
            organization = results[1];
          if (team.status === "fulfilled" && !team.value.error) {
            setMembers(team.value.data);
            await workspace.metadata("team", team.value.data);
          }
          if (organization.status === "fulfilled" && !organization.value.error)
            setOrg(organization.value.data.name);
        }
      }
    })().catch((e) => notify(e.message, "error"));
    return () => {
      alive = false;
      unsubscribe();
      workspace.close();
    };
  }, [identity]);
  async function sync() {
    const active = storeRef.current;
    if (!active?.client || !navigator.onLine || syncRef.current) return;
    syncRef.current = true;
    setSyncing(true);
    setSyncError("");
    try {
      await timeout(active.sync(), 60000);
      if (storeRef.current === active) {
        const dirty = (await active.list()).filter(
          (p) => p._sync === "error" || p._sync === "conflict",
        );
        setSyncError(
          dirty.length
            ? `${dirty.length}件の同期に確認が必要です。同期・保管を開いてください。`
            : "",
        );
        setLastSync(now());
      }
    } catch (e) {
      if (storeRef.current === active) setSyncError(e.message);
    } finally {
      syncRef.current = false;
      setSyncing(false);
    }
  }
  useEffect(() => {
    if (!store?.client || !online) return;
    sync();
    const id = setInterval(sync, 30000);
    return () => clearInterval(id);
  }, [store, online]);
  const syncFingerprint = projects
    .map((p) => `${p.id}:${p.updated_at}:${p._sync}`)
    .join("|");
  useEffect(() => {
    if (!store?.client || !online) return;
    const id = setTimeout(sync, 1200);
    return () => clearTimeout(id);
  }, [syncFingerprint, store, online]);
  async function logout(allowPending = false) {
    if (
      store &&
      (await store.pending()) &&
      !identity.demo &&
      allowPending !== true
    ) {
      notify(
        "未同期の記録があります。同期・保管で同期またはバックアップを行ってから終了してください。",
        "error",
      );
      setPage("sync");
      return;
    }
    if (identity.demo) {
      sessionStorage.removeItem("wildpass-demo");
      setIdentity(null);
      window.location.assign(import.meta.env.BASE_URL);
      return;
    }
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      notify(error.message, "error");
      return;
    }
    setIdentity(null);
    localStorage.removeItem("wildpass-last-user");
    setProjectId("");
    setPage("dashboard");
  }
  function openProject(p, target = "work") {
    setProjectId(p.id);
    setPage("project");
    setTab(target);
    setStage(p.workspace.activeStage || String(p.stage || 1));
    setMobile(false);
  }
  const project = projects.find((p) => p.id === projectId),
    pending = projects.filter((p) => p._sync !== "synced").length;
  const tasks = projects.flatMap((p) =>
      allTasks(p).map((t) => ({ ...t, project: p })),
    ),
    reviewCount = tasks.filter((t) => t.status === "review").length,
    overdue = tasks.filter(
      (t) => t.due && t.due < today() && t.status !== "approved",
    ).length;
  const shown = projects
    .filter((p) =>
      `${p.name} ${p.client} ${p.pref}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter(
      (p) =>
        filter === "all" ||
        (filter === "mine" &&
          allTasks(p).some(
            (t) => t.assignee === identity?.id && t.status !== "approved",
          )) ||
        (filter === "review" && allTasks(p).some((t) => t.status === "review")),
    );
  const activeProfile = identity?.demo ? demoActor : identity;
  const common = { project, store, profile: activeProfile, members, notify };
  if (loading)
    return (
      <div className="loading-screen">
        <Leaf />
        <h1>Wildpassを開いています</h1>
        <p>アカウントとワークスペースを確認中…</p>
      </div>
    );
  if (!identity)
    return (
      <Auth
        initialError={authError}
        onRetry={() => {
          setLoading(true);
          timeout(supabase.auth.getSession())
            .then(({ data }) => acceptSession(data.session))
            .catch((e) => {
              setAuthError(e.message);
              setLoading(false);
            });
        }}
        onDemo={() => {
          sessionStorage.setItem("wildpass-demo", "yes");
          setIdentity(DEMO);
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <Leaf />
          wildpass<span>環境アセスメント</span>
        </a>
        <div className="workspace-label">
          <span className="org-avatar">{org.slice(0, 1)}</span>
          <div>
            <strong>{org}</strong>
            <small>
              {identity.demo ? "端末内のデモ環境" : "チームワークスペース"}
            </small>
          </div>
        </div>
        <p className="nav-heading">WORKSPACE</p>
        <nav>
          {[
            ["dashboard", "概要", LayoutDashboard],
            ["projects", "プロジェクト", FolderKanban],
            ["team", "メンバー", Users],
            ["sync", "同期・保管", Cloud],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              className={
                page === id || (id === "projects" && page === "project")
                  ? "active"
                  : ""
              }
              onClick={() => {
                setPage(id);
                setMobile(false);
              }}
            >
              <Icon size={19} />
              {label}
              {id === "sync" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf size={19} />
          <strong>記録を、次の判断へ。</strong>
          <p>
            計画・証拠・照査をつなぐ
            <br />
            環境アセスメントの仕事場。
          </p>
        </div>
        <div className="profile-menu">
          <div className="avatar">{activeProfile.name?.slice(0, 1) || "W"}</div>
          <div>
            <strong>{activeProfile.name}</strong>
            <small>{ROLE_NAMES[activeProfile.role]}</small>
          </div>
          <button
            aria-label="ログアウト"
            className="icon-button"
            data-navigation
            onClick={() => logout()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-toggle icon-button"
            aria-label="メニューを開く"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            <span>ワークスペース</span>
            <ChevronRight size={14} />
            <strong>
              {page === "project"
                ? project?.name
                : {
                    dashboard: "概要",
                    projects: "プロジェクト",
                    team: "メンバー",
                    sync: "同期・保管",
                  }[page]}
            </strong>
          </div>
          <div className="topbar-actions">
            {identity.demo && <Badge tone="amber">DEMO</Badge>}
            <button
              className={`sync-pill ${!online ? "offline" : ""}`}
              onClick={() => setPage("sync")}
            >
              {online ? <Cloud size={15} /> : <CloudOff size={15} />}
              <span>
                {identity.demo
                  ? "端末内に保存"
                  : !online
                    ? "オフライン"
                    : syncing
                      ? "同期中…"
                      : pending
                        ? `${pending}案件が同期待ち`
                        : "共有データを確認"}
              </span>
            </button>
          </div>
        </header>
        {swUpdate && (
          <div className="update-banner">
            新しいバージョンを利用できます。入力中の内容を保存してから更新してください。
            <Button
              onClick={async () => {
                const reg = await navigator.serviceWorker.getRegistration();
                reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
                navigator.serviceWorker.addEventListener(
                  "controllerchange",
                  () => location.reload(),
                  { once: true },
                );
              }}
            >
              更新する
            </Button>
          </div>
        )}
        <main>
          {identity.demo && (
            <div className="demo-banner">
              <span>
                デモ環境 ·
                実案件のデータとは分離されています。通信なしでも保存・報告書出力を試せます。
              </span>
              <button
                onClick={() => {
                  const next =
                    store.profile.id === DEMO.id ? DEMO_REVIEWER : DEMO;
                  store.profile = next;
                  setDemoActor(next);
                  notify(`${next.name}として操作します。`);
                }}
              >
                デモ担当者を切替
              </button>
            </div>
          )}
          {syncError && page !== "sync" && (
            <Notice tone="warning">
              共有同期に確認が必要です。端末に保存済みの記録は同期・保管から確認できます。
              <Button variant="quiet" onClick={() => setPage("sync")}>
                詳細を見る
              </Button>
            </Notice>
          )}
          {(page === "dashboard" || page === "projects") && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {page === "dashboard"
                      ? "WORKSPACE OVERVIEW"
                      : "PROJECT PORTFOLIO"}
                  </p>
                  <h1>
                    {page === "dashboard"
                      ? "今日の仕事を、見渡す。"
                      : "プロジェクト"}
                  </h1>
                  <p>
                    調査の進行、チームの確認待ち、次のアクションをひとつに。
                  </p>
                </div>
                {canEdit(identity) && (
                  <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => setCreate(true)}
                  >
                    プロジェクトを作成
                  </Button>
                )}
              </div>
              {page === "dashboard" && (
                <>
                  <div className="stats">
                    <Stat
                      label="進行中のプロジェクト"
                      value={projects.filter((p) => progress(p) < 100).length}
                      icon={FolderKanban}
                      detail="チームで共有する案件"
                    />
                    <Stat
                      label="照査待ちの業務"
                      value={reviewCount}
                      icon={CheckCircle2}
                      detail="担当者の確認を待っています"
                      tone="green"
                    />
                    <Stat
                      label="期限を過ぎた業務"
                      value={overdue}
                      icon={Clock3}
                      detail="日程と対応を確認"
                      tone={overdue ? "amber" : ""}
                    />
                    <Stat
                      label="記録された証拠資料"
                      value={projects.reduce(
                        (n, p) => n + p.documents.length,
                        0,
                      )}
                      icon={Paperclip}
                      detail="調査の判断根拠を蓄積"
                    />
                  </div>
                  <div className="focus-banner">
                    <div className="focus-icon">
                      <ClipboardList />
                    </div>
                    <div>
                      <h2>次の一歩は、担当業務から。</h2>
                      <p>
                        現場の記録を保存し、資料を添付して照査へ提出しましょう。
                      </p>
                    </div>
                    <Button
                      icon={ArrowUpRight}
                      onClick={() => {
                        setFilter("mine");
                        setPage("projects");
                      }}
                    >
                      自分の担当を見る
                    </Button>
                  </div>
                </>
              )}
              <Panel
                title="プロジェクト一覧"
                subtitle={`${shown.length}件のプロジェクト`}
                action={
                  <div className="search-input">
                    <Search size={16} />
                    <input
                      aria-label="プロジェクトを検索"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="案件名・事業者・所在地"
                    />
                  </div>
                }
              >
                <div className="filter-row">
                  {[
                    ["all", "すべて"],
                    ["mine", "自分の担当"],
                    ["review", "照査待ち"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={filter === id ? "active" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {shown.length ? (
                  <div className="project-grid">
                    {shown.map((p) => (
                      <button
                        className="project-card"
                        key={p.id}
                        onClick={() => openProject(p)}
                      >
                        <div className="row-between">
                          <Badge>{TYPES[p.type] || p.type || "未設定"}</Badge>
                          <ArrowUpRight size={18} />
                        </div>
                        <h3>{p.name}</h3>
                        <p>{p.client || "事業者を設定してください"}</p>
                        <div className="project-location">
                          <MapPin size={14} />
                          {p.pref || "所在地未設定"}
                          <span>
                            {p.deadline ? `納期 ${p.deadline}` : "納期未設定"}
                          </span>
                        </div>
                        <div className="progress-label">
                          <span>業務の照査完了</span>
                          <strong>{progress(p)}%</strong>
                        </div>
                        <div className="progress-track">
                          <span style={{ width: `${progress(p)}%` }} />
                        </div>
                        <div className="card-footer">
                          <span>
                            <Bird size={14} />
                            {p.species_data.length} 記録
                          </span>
                          <span>
                            <Paperclip size={14} />
                            {p.documents.length} 資料
                          </span>
                          <Badge
                            tone={
                              p._sync === "synced"
                                ? "green"
                                : p._sync === "conflict"
                                  ? "red"
                                  : "amber"
                            }
                          >
                            {p._sync === "synced"
                              ? "共有済み"
                              : identity.demo
                                ? "端末保存"
                                : p._sync === "conflict"
                                  ? "競合確認"
                                  : "同期待ち"}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={
                      query || filter !== "all"
                        ? "該当する案件がありません"
                        : "最初のプロジェクトを作成"
                    }
                    text="事業情報を入力すると、計画から事後調査までの業務を準備します。必要な業務に合わせて編集してください。"
                  />
                )}
              </Panel>
            </>
          )}
          {page === "project" && project && (
            <>
              <div className="page-heading project-heading">
                <div>
                  <button
                    className="text-button"
                    onClick={() => setPage("projects")}
                  >
                    ← プロジェクト一覧
                  </button>
                  <h1>{project.name}</h1>
                  <p>
                    {project.client} <span>·</span> {project.pref}{" "}
                    <span>·</span> {TYPES[project.type] || project.type}
                  </p>
                </div>
                <Button
                  icon={FileText}
                  variant="primary"
                  data-navigation
                  onClick={() => setTab("reports")}
                >
                  報告書を作成
                </Button>
              </div>
              <div className="project-tabs" role="tablist">
                {tabs.map(([id, label, Icon]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    className={tab === id ? "active" : ""}
                    onClick={() => setTab(id)}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
              {tab === "work" && (
                <WorkPanel
                  {...common}
                  profile={identity.demo ? store.profile : identity}
                  stage={stage}
                  setStage={setStage}
                />
              )}
              {tab === "observations" && <ObservationsPanel {...common} />}
              {tab === "measurements" && <MeasurementsPanel {...common} />}
              {tab === "evidence" && <EvidencePanel {...common} />}
              {tab === "legal" && <LegalPanel {...common} />}
              {tab === "opinions" && <OpinionsPanel {...common} />}
              {tab === "reports" && <ReportsPanel {...common} />}
              {tab === "history" && <HistoryPanel {...common} />}
              {tab === "settings" && <ProjectSettings {...common} />}
            </>
          )}
          {page === "team" && (
            <TeamPanel
              identity={identity}
              members={members}
              store={store}
              notify={notify}
              onMembersChange={setMembers}
            />
          )}
          {page === "sync" && (
            <SyncPanel
              store={store}
              projects={projects}
              profile={identity}
              online={online}
              syncing={syncing}
              sync={sync}
              syncError={syncError}
              lastSync={lastSync}
              notify={notify}
              onBackupLogout={() => logout(true)}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>Wildpass · 環境アセスメントワークスペース</span>
          <span>{identity.demo ? "デモデータ" : org} · 2026</span>
        </footer>
      </div>
      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={`toast ${toast.tone}`}
        >
          {toast.tone === "error" ? (
            <CircleAlert size={19} />
          ) : (
            <CheckCircle2 size={19} />
          )}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="通知を閉じる"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {create && (
        <Modal title="プロジェクトを作成" wide onClose={() => setCreate(false)}>
          <AsyncForm
            submitLabel="プロジェクトを作成"
            onSubmit={async (v) => {
              const p = newProject(v, identity);
              await store.create(p);
              setCreate(false);
              setProjectId(p.id);
              setTab("legal");
              setPage("project");
              notify(
                "プロジェクトを端末に保存しました。適用法令の確認から始めてください。",
              );
            }}
          >
            <Field
              label="プロジェクト名"
              name="name"
              required
              maxLength={200}
              placeholder="例：〇〇風力発電計画"
            />
            <div className="form-grid">
              <Field label="事業者名" name="client" required />
              <Field label="事業種別">
                <select name="type">
                  {Object.entries(TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="都道府県・市区町村" name="pref" required />
              <Field label="社内の納品予定日" name="deadline" type="date" />
            </div>
            <Field label="事業概要">
              <textarea name="description" rows="3" />
            </Field>
          </AsyncForm>
        </Modal>
      )}
      {recovering && (
        <Modal
          title="新しいパスワードを設定"
          onClose={() => setRecovering(false)}
        >
          <AsyncForm
            onSubmit={async (v) => {
              if (v.password !== v.confirm)
                throw new Error("パスワードが一致しません。");
              const { error } = await supabase.auth.updateUser({
                password: v.password,
              });
              if (error) throw error;
              setRecovering(false);
              notify("パスワードを更新しました。");
            }}
          >
            <Field
              label="新しいパスワード（12文字以上）"
              type="password"
              name="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
            <Field
              label="もう一度入力"
              type="password"
              name="confirm"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </AsyncForm>
        </Modal>
      )}
    </div>
  );
}
function Stat({ label, value, icon: Icon, detail, tone = "" }) {
  return (
    <div className="stat">
      <div className="row-between">
        <span>{label}</span>
        <Icon size={18} className={tone} />
      </div>
      <strong>
        {value}
        <small>件</small>
      </strong>
      <p>{detail}</p>
    </div>
  );
}
function TeamPanel({ identity, members, store, notify, onMembersChange }) {
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PEOPLE & RESPONSIBILITIES</p>
          <h1>同じ案件を、チームで。</h1>
          <p>
            組織内の案件はメンバーに共有され、権限に応じて記録・照査できます。
          </p>
        </div>
        {identity.role === "admin" && (
          <Button
            variant="primary"
            icon={Plus}
            disabled={!store?.client}
            onClick={() => setInviting(true)}
          >
            参加を許可
          </Button>
        )}
      </div>
      <Panel title="メンバー">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>メンバー</th>
                <th>権限</th>
                <th>できること</th>
                <th>管理</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    {m.id === identity.id && <small>あなた</small>}
                  </td>
                  <td>
                    <Badge>{ROLE_NAMES[m.role] || m.role}</Badge>
                    {m.suspended_at && <Badge tone="amber">利用停止</Badge>}
                  </td>
                  <td>
                    {m.role === "client"
                      ? "閲覧・原本ダウンロード"
                      : m.role === "surveyor" || m.role === "author"
                        ? "記録・資料・報告書作成・照査への提出"
                        : "記録・資料・報告書作成・他者が提出した業務の照査"}
                  </td>
                  <td>
                    {identity.role === "admin" && m.id !== identity.id && (
                      <Button
                        disabled={!store?.client}
                        onClick={() => setEditing(m)}
                      >
                        権限・利用状態
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Notice>
        照査は提出者以外の担当者が行います。管理者は未登録のメールアドレスへの参加許可を作成できます。メールは自動送信されません。相手にアプリのURLと登録するメールアドレスを共有してください。
      </Notice>
      {editing && (
        <Modal
          title={`${editing.name} · 権限と利用状態`}
          onClose={() => setEditing(null)}
        >
          <AsyncForm
            onSubmit={async (v) => {
              const { error } = await store.client.rpc(
                "manage_workspace_member",
                {
                  p_member: editing.id,
                  p_role: v.role,
                  p_suspended: v.state === "suspended",
                },
              );
              if (error) throw error;
              const { data, error: loadError } = await store.client
                .from("profiles")
                .select("*")
                .eq("organization_id", identity.organization_id);
              if (loadError) throw loadError;
              onMembersChange(data);
              await store.metadata("team", data);
              setEditing(null);
              notify("権限を更新し、管理履歴をサーバーに記録しました。");
            }}
          >
            <Field label="権限">
              <select name="role" defaultValue={editing.role}>
                {Object.entries(ROLE_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="利用状態">
              <select
                name="state"
                defaultValue={editing.suspended_at ? "suspended" : "active"}
              >
                <option value="active">利用可能</option>
                <option value="suspended">利用停止</option>
              </select>
            </Field>
            <Notice>
              利用停止後は共有データへのアクセスと同期を拒否します。既に取得した端末内のデータは遠隔消去できません。退職・端末紛失時は会社の端末管理手順も実施してください。
            </Notice>
          </AsyncForm>
        </Modal>
      )}
      {inviting && (
        <Modal
          title="新しいメンバーの参加を許可"
          onClose={() => setInviting(false)}
        >
          <AsyncForm
            onSubmit={async (v) => {
              const { error } = await store.client.rpc(
                "invite_workspace_member",
                { p_email: v.email, p_role: v.role },
              );
              if (error) throw error;
              setInviting(false);
              notify(
                "7日間有効の参加許可を登録しました。このメールアドレスでアプリに新規登録してもらってください。",
              );
            }}
          >
            <Field
              label="未登録のメールアドレス"
              type="email"
              name="email"
              required
            />
            <Field label="権限">
              <select name="role">
                {Object.entries(ROLE_NAMES)
                  .filter(([id]) => id !== "admin")
                  .map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </Field>
          </AsyncForm>
        </Modal>
      )}
    </>
  );
}
function SyncPanel({
  store,
  projects,
  profile,
  online,
  syncing,
  sync,
  syncError,
  lastSync,
  notify,
  onBackupLogout,
}) {
  const [busy, setBusy] = useState(""),
    [conflict, setConflict] = useState(null);
  const [offlineShell, setOfflineShell] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const reg = await navigator.serviceWorker?.getRegistration(
        import.meta.env.BASE_URL,
      );
      if (alive)
        setOfflineShell(!!reg?.active?.scriptURL.endsWith("/workspace-sw.js"));
    };
    navigator.serviceWorker?.ready.then(check);
    navigator.serviceWorker?.addEventListener("controllerchange", check);
    return () => {
      alive = false;
      navigator.serviceWorker?.removeEventListener("controllerchange", check);
    };
  }, []);
  async function backup(exit = false) {
    setBusy("backup");
    try {
      const { backupZip, download } = await import("./domain/report.js");
      download(
        await backupZip(await store.backup()),
        `Wildpass_backup_${today()}.zip`,
      );
      notify("端末データと原本をバックアップに出力しました。");
      if (exit === true) await onBackupLogout();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SYNC & RECOVERY</p>
          <h1>現場の記録を、確実につなぐ。</h1>
          <p>端末への保存と、チームへの共有を区別して確認します。</p>
        </div>
        <Button
          variant="primary"
          busy={syncing}
          disabled={!online || !store?.client}
          icon={RefreshCw}
          onClick={sync}
        >
          今すぐ同期
        </Button>
      </div>
      <div className="stats">
        <Stat
          label="端末に保存した案件"
          value={projects.length}
          icon={FolderKanban}
          detail="このアカウント専用の保管領域"
        />
        <Stat
          label="共有への同期待ち"
          value={projects.filter((p) => p._sync !== "synced").length}
          icon={Cloud}
          detail={
            profile.demo
              ? "デモ環境ではクラウド共有しません"
              : online
                ? "接続時に自動再試行します"
                : "オンライン復帰後に再試行"
          }
        />
        <Stat
          label="確認が必要な競合"
          value={projects.filter((p) => p._sync === "conflict").length}
          icon={CircleAlert}
          detail="双方の記録を比較して解決"
        />
      </div>
      {syncError && <Notice tone="warning">{syncError}</Notice>}
      <Notice tone={offlineShell ? "info" : "warning"}>
        {offlineShell
          ? "アプリのオフライン準備が完了しています。出発前に必要な原本も準備してください。"
          : import.meta.env.DEV
            ? "開発環境です。オフラインでの再起動は公開版で確認してください。"
            : "アプリのオフライン準備を確認中です。通信を維持し、更新の案内があれば適用してください。完了表示を確認してから現場へ出発してください。"}
      </Notice>
      {lastSync && (
        <p className="help-text">
          最終接続確認: <Time value={lastSync} />
        </p>
      )}
      <Panel title="案件ごとの保存状況">
        <div className="sync-list">
          {projects.map((p) => (
            <div key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p._sync === "synced"
                    ? `共有版 ${p.version}`
                    : profile.demo
                      ? "デモ・端末内のみ"
                      : p._error || "端末保存済み・共有への同期待ち"}
                </small>
              </div>
              {p._sync === "conflict" ? (
                <Button onClick={() => setConflict(p)}>変更を比較</Button>
              ) : (
                <Badge tone={p._sync === "synced" ? "green" : "amber"}>
                  {p._sync === "synced"
                    ? "共有済み"
                    : profile.demo
                      ? "端末保存"
                      : "同期待ち"}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="現場に出る前・端末を変える前"
        subtitle="オフラインで必要な原本を取得し、端末の消去・故障に備えます。"
        action={
          <Button
            onClick={async () => {
              try {
                if (!(await promptInstall()))
                  notify(
                    "ブラウザーの「アプリをインストール」、またはSafariの「共有 → ホーム画面に追加」を選択してください。",
                  );
              } catch (e) {
                notify(e.message, "error");
              }
            }}
          >
            ホーム画面に追加
          </Button>
        }
      >
        <div className="recovery-grid">
          <div>
            <Download />
            <h3>原本を端末に準備</h3>
            <p>共有済みの写真・資料・報告書をこの端末にダウンロードします。</p>
            <Button
              busy={busy === "prepare"}
              disabled={!!busy}
              onClick={async () => {
                setBusy("prepare");
                try {
                  let count = 0;
                  for (const p of projects)
                    for (const d of [...p.documents, ...p.workspace.reports]) {
                      await store.file(d);
                      count++;
                    }
                  const persist = await navigator.storage?.persist?.();
                  notify(
                    `${count}件の原本を準備しました。${persist ? "ブラウザーの永続保存が許可されています。" : "重要なデータはバックアップも保存してください。"}`,
                  );
                } catch (e) {
                  notify(
                    `一部の原本を準備できませんでした: ${e.message}`,
                    "error",
                  );
                } finally {
                  setBusy("");
                }
              }}
            >
              オフライン用に準備
            </Button>
          </div>
          <div>
            <PackageIcon />
            <h3>端末のバックアップ</h3>
            <p>
              案件データ・未同期の変更・原本をZIPで保存します。会社の安全な保管先に保存してください。
            </p>
            <Button busy={busy === "backup"} disabled={!!busy} onClick={backup}>
              バックアップ ZIP
            </Button>
            {!profile.demo && (
              <Button
                disabled={!!busy}
                data-navigation
                onClick={() => backup(true)}
              >
                バックアップしてログアウト
              </Button>
            )}
          </div>
          <div>
            <History />
            <h3>バックアップから復元</h3>
            <p>
              同じ組織・同じアカウントのバックアップを読み込みます。異なる編集は競合として保管します。
            </p>
            <label className="upload-button">
              ZIPを選択
              <input
                type="file"
                accept=".zip"
                disabled={!!busy || !canEdit(profile)}
                onChange={async (e) => {
                  const file = e.target.files[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy("restore");
                  try {
                    if (file.size > 200 * 1024 * 1024)
                      throw new Error(
                        "200MB以下のバックアップを選択してください。",
                      );
                    const { unzipSync, strFromU8 } = await import("fflate");
                    let expandedSize = 0;
                    const entries = unzipSync(
                        new Uint8Array(await file.arrayBuffer()),
                        {
                          filter: (entry) => {
                            expandedSize += entry.originalSize;
                            if (expandedSize > 200 * 1024 * 1024)
                              throw new Error(
                                "展開後のバックアップが200MBを超えています。",
                              );
                            return true;
                          },
                        },
                      ),
                      metadata = JSON.parse(strFromU8(entries["backup.json"]));
                    const files = metadata.files.map((f) => {
                      if (!entries[`files/${f.id}`])
                        throw new Error(
                          "バックアップ内の原本が不足しています。",
                        );
                      return {
                        ...f,
                        blob: new Blob([entries[`files/${f.id}`]], {
                          type: f.contentType || "application/octet-stream",
                        }),
                      };
                    });
                    await store.restore(metadata, files);
                    notify("復元しました。保存状況と競合を確認してください。");
                  } catch (err) {
                    notify(`復元できません: ${err.message}`, "error");
                  } finally {
                    setBusy("");
                  }
                }}
              />
            </label>
          </div>
        </div>
      </Panel>
      {!profile.demo && canEdit(profile) && (
        <Panel
          title="旧版からの記録の引き継ぎ"
          subtitle="このブラウザーに残っている旧版の案件・未送信の写真を確認します。旧版のデータはそのまま保管します。"
        >
          <Button
            busy={busy === "legacy"}
            disabled={!!busy}
            onClick={async () => {
              setBusy("legacy");
              try {
                const result = await store.recoverLegacy();
                notify(
                  `${result.projects}件の案件と${result.files}件の原本を復旧しました。競合がある場合は双方の記録を比較してください。`,
                );
              } catch (e) {
                notify(e.message, "error");
              } finally {
                setBusy("");
              }
            }}
          >
            旧版の端末データを確認・復旧
          </Button>
        </Panel>
      )}
      <Notice>
        ブラウザーの保存領域には上限があり、端末やブラウザーのデータを消去すると未同期の記録を失う可能性があります。共有済みか確認し、オフライン作業中はバックアップも利用してください。
      </Notice>
      {conflict && (
        <Modal
          wide
          title="同じ項目の編集が競合しています"
          onClose={() => setConflict(null)}
        >
          <p>競合する項目: {conflict._conflict.paths.join("、")}</p>
          <div className="conflict-grid">
            <div>
              <h3>この端末の記録</h3>
              <pre>
                {JSON.stringify({ ...conflict, _conflict: undefined }, null, 2)}
              </pre>
            </div>
            <div>
              <h3>共有側・復元データの記録</h3>
              <pre>{JSON.stringify(conflict._conflict.remote, null, 2)}</pre>
            </div>
          </div>
          <Notice>
            異なる項目の変更は統合します。競合した項目に採用する側を選んでください。両方の元データは復旧用として端末に残ります。
          </Notice>
          <div className="form-actions">
            <Button
              onClick={async () => {
                await store.resolve(conflict.id, "remote");
                setConflict(null);
                notify("共有側の競合項目を採用しました。");
              }}
            >
              共有側の競合項目を採用
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await store.resolve(conflict.id, "local");
                setConflict(null);
                notify("端末側の競合項目を採用しました。");
              }}
            >
              端末側の競合項目を採用
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function PackageIcon() {
  return <Download />;
}

import { useState, useEffect } from "react";
import { supabase, isConfigured } from "./lib/supabase.js";

// ─── TOKENS ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#F4F1EA", surface:"#FFFFFF", warm:"#FAF8F3",
  border:"#DDD8CE", borderLight:"#EDE9E1",
  primary:"#1B4332", mid:"#2D6A4F", light:"#D8EFE3",
  amber:"#C47B0A", amberLight:"#FEF3C7",
  red:"#B91C1C", redLight:"#FEE2E2",
  blue:"#1D4ED8", blueLight:"#DBEAFE",
  purple:"#6D28D9", purpleLight:"#EDE9FE",
  text:"#1C1917", textMid:"#44403C", textMuted:"#78716C", textFaint:"#A8A29E",
  white:"#FFFFFF",
  shadow:"0 1px 4px rgba(0,0,0,0.07),0 4px 16px rgba(0,0,0,0.04)",
  shadowMd:"0 4px 20px rgba(0,0,0,0.10)",
};

const STAGES = [
  { id:1, short:"配慮書",   label:"配慮書手続",   color:"#059669", desc:"事業の早期環境配慮・初期スコーピング" },
  { id:2, short:"方法書",   label:"方法書手続",   color:"#2563EB", desc:"調査手法の設計・公告・縦覧・意見聴取" },
  { id:3, short:"現地調査", label:"現地調査",     color:"#D97706", desc:"実際の生物多様性フィールド調査・記録" },
  { id:4, short:"準備書",   label:"準備書手続",   color:"#7C3AED", desc:"環境影響評価準備書の作成・縦覧・意見聴取" },
  { id:5, short:"意見聴取", label:"意見聴取",     color:"#DB2777", desc:"1ヶ月間の公告・縦覧・寄せられた意見の管理" },
  { id:6, short:"評価書",   label:"評価書",       color:"#DC2626", desc:"最終評価書の作成・許認可機関への提出" },
  { id:7, short:"事後調査", label:"事後調査",     color:"#0891B2", desc:"工事中・供用後の継続モニタリング" },
];

const ROLE_CFG = {
  admin:    { label:"管理者",                    color:C.primary, badge:C.light },
  pm:       { label:"プロジェクトマネージャー",  color:C.blue,    badge:C.blueLight },
  surveyor: { label:"フィールド調査員",          color:C.amber,   badge:C.amberLight },
  author:   { label:"報告書作成者",              color:C.purple,  badge:C.purpleLight },
  client:   { label:"クライアント",              color:"#6B7280", badge:"#F3F4F6" },
  reviewer: { label:"査読者",                    color:"#DB2777", badge:"#FCE7F3" },
};

const PLANS = {
  starter:      { label:"スターター",         price:"¥80,000/案件",   maxUsers:3,  maxProjects:5,  color:"#6B7280" },
  professional: { label:"プロフェッショナル", price:"¥480,000/年",    maxUsers:10, maxProjects:999, color:"#1B4332" },
  enterprise:   { label:"エンタープライズ",   price:"¥1,200,000/年",  maxUsers:999,maxProjects:999, color:"#7C3AED" },
};

const ORGS = [
  { id:1, name:"環境総合コンサルタント株式会社", plan:"professional", users:8,  projects:12 },
  { id:2, name:"東日本エコテック株式会社",       plan:"enterprise",   users:24, projects:31 },
  { id:3, name:"グリーンフィールド調査設計",     plan:"starter",      users:3,  projects:2  },
];

const TEAM = [
  { id:1, name:"田中 誠一",   email:"tanaka@company.jp",    role:"pm",       joined:"2024-04-01", active:true  },
  { id:2, name:"佐藤 由美",   email:"sato@company.jp",      role:"pm",       joined:"2024-06-15", active:true  },
  { id:3, name:"山田 健太",   email:"yamada@company.jp",    role:"surveyor", joined:"2024-09-01", active:true  },
  { id:4, name:"鈴木 浩二",   email:"suzuki@company.jp",    role:"surveyor", joined:"2025-01-10", active:true  },
  { id:5, name:"高橋 美咲",   email:"takahashi@company.jp", role:"author",   joined:"2024-04-01", active:true  },
  { id:6, name:"渡辺 隆",     email:"watanabe@company.jp",  role:"reviewer", joined:"2025-03-01", active:true  },
  { id:7, name:"伊藤さくら",  email:"ito@client.jp",        role:"client",   joined:"2025-11-20", active:false },
];

const STATUS_CFG = {
  CR:{ label:"絶滅危惧IA類", c:"#B91C1C", bg:"#FEE2E2" },
  EN:{ label:"絶滅危惧IB類", c:"#C2410C", bg:"#FFEDD5" },
  VU:{ label:"絶滅危惧II類", c:"#B45309", bg:"#FEF3C7" },
  NT:{ label:"準絶滅危惧",   c:"#1D4ED8", bg:"#DBEAFE" },
  LC:{ label:"軽度懸念",     c:"#065F46", bg:"#D1FAE5" },
};

const TYPE_ICONS = { wind:"💨", road:"🛣️", port:"⚓", dam:"🌊", rail:"🚄", solar:"☀️" };
const RISK_CFG = {
  high:  { label:"高リスク", c:C.red,   bg:C.redLight },
  medium:{ label:"中リスク", c:C.amber, bg:C.amberLight },
  low:   { label:"低リスク", c:C.mid,   bg:C.light },
};

const BLANK_SPECIES = { name:"", latin:"", type:"植物", status:"LC", protected:false, count:1, location:"", date:"", notes:"" };

const makeInitialTasks = (stage) => ({
  1: [
    { id:"1a", label:"事業の目的・内容・規模の整理",                    done:true  },
    { id:"1b", label:"対象地域の地形・土地利用の把握",                  done:true  },
    { id:"1c", label:"生息地感度事前スクリーニング（デスクトップ調査）", done:true  },
    { id:"1d", label:"配慮書（生物多様性章）の作成",                    done:false },
    { id:"1e", label:"主務大臣への配慮書提出",                          done:false },
  ],
  2: [
    { id:"2a", label:"調査対象種群の選定（環境省指針に基づく）",     done:true  },
    { id:"2b", label:"調査手法・調査時期・調査地点の設計",           done:true  },
    { id:"2c", label:"方法書の公告・縦覧（30日間）",                 done:false },
    { id:"2d", label:"住民・行政からの意見収集",                     done:false },
    { id:"2e", label:"方法書の最終確定・主務大臣提出",               done:false },
  ],
  3: [
    { id:"3a", label:"春季調査の実施（植物・鳥類繁殖期）",   done:false },
    { id:"3b", label:"夏季調査の実施（昆虫・両生類）",       done:false },
    { id:"3c", label:"秋季調査の実施（哺乳類・植物結実期）", done:false },
    { id:"3d", label:"冬季調査の実施（越冬鳥類・魚類）",     done:false },
    { id:"3e", label:"全確認種のデータ整理・同定確認",        done:false },
  ],
  4: [
    { id:"4a", label:"調査データの集計・解析",                done:false },
    { id:"4b", label:"レッドリスト照合・保護種フラグ付け",    done:false },
    { id:"4c", label:"環境影響予測・影響マトリクス作成",      done:false },
    { id:"4d", label:"保全措置の検討",                        done:false },
    { id:"4e", label:"準備書（生物多様性章）の作成・提出",    done:false },
  ],
  5: [
    { id:"5a", label:"準備書の公告・縦覧（30日間）",              done:false },
    { id:"5b", label:"住民説明会の開催",                          done:false },
    { id:"5c", label:"寄せられた意見の整理・回答書作成",          done:false },
    { id:"5d", label:"主務大臣・都道府県知事への意見回答提出",    done:false },
  ],
  6: [
    { id:"6a", label:"評価書（生物多様性章）の最終作成",   done:false },
    { id:"6b", label:"第三者専門家による査読・確認",        done:false },
    { id:"6c", label:"許認可機関への評価書正式提出",        done:false },
    { id:"6d", label:"評価書の公告・縦覧（30日間）",        done:false },
  ],
  7: [
    { id:"7a", label:"工事中モニタリング計画の策定",            done:false },
    { id:"7b", label:"工事中モニタリング調査の実施",            done:false },
    { id:"7c", label:"供用後モニタリング調査の実施（年1回）",   done:false },
    { id:"7d", label:"モニタリング報告書の作成・提出",          done:false },
  ],
}[stage] || []);

const INIT_PROJECTS = [
  { id:1, name:"北海道洋上風力発電EIA",  client:"J-Power株式会社",          type:"wind", stage:3, pref:"北海道", deadline:"2026-08-15", species:[], redListCount:0, risk:"high",   progress:42, manager:"田中 誠一", area:"2400", budget:"38000000", desc:"北海道沖合の洋上風力発電プロジェクト（45MW）の環境影響評価。渡り鳥ルートとの重複が課題。", tasks:{1:makeInitialTasks(1).map(t=>({...t,done:true})),2:makeInitialTasks(2).map(t=>({...t,done:true})),3:makeInitialTasks(3),4:makeInitialTasks(4),5:makeInitialTasks(5),6:makeInitialTasks(6),7:makeInitialTasks(7)}, comments:[], documents:[] },
  { id:2, name:"東京湾岸道路拡張事業",   client:"東日本高速道路株式会社",    type:"road", stage:5, pref:"千葉県", deadline:"2026-05-30", species:[], redListCount:2, risk:"medium", progress:71, manager:"佐藤 由美", area:"580",   budget:"12500000", desc:"千葉県沿岸部の国道延伸工事。干潟・砂浜の希少種への影響評価が主要論点。", tasks:{1:makeInitialTasks(1).map(t=>({...t,done:true})),2:makeInitialTasks(2).map(t=>({...t,done:true})),3:makeInitialTasks(3).map(t=>({...t,done:true})),4:makeInitialTasks(4).map(t=>({...t,done:true})),5:makeInitialTasks(5),6:makeInitialTasks(6),7:makeInitialTasks(7)}, comments:[], documents:[] },
  { id:3, name:"大阪湾埋立プロジェクト", client:"大林組",                    type:"port", stage:2, pref:"大阪府", deadline:"2027-02-28", species:[], redListCount:0, risk:"low",    progress:18, manager:"山田 健太", area:"340",   budget:"8200000",  desc:"大阪湾の港湾拡張に伴う埋立事業。海洋生物多様性への影響評価。", tasks:{1:makeInitialTasks(1).map(t=>({...t,done:true})),2:makeInitialTasks(2),3:makeInitialTasks(3),4:makeInitialTasks(4),5:makeInitialTasks(5),6:makeInitialTasks(6),7:makeInitialTasks(7)}, comments:[], documents:[] },
];

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function Chip({ children, color, bg, size=12 }) {
  return <span style={{ background:bg||`${color}18`, color, border:`1px solid ${color}40`,
    borderRadius:20, padding:"3px 10px", fontSize:size, fontWeight:700,
    fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>{children}</span>;
}

function Btn({ children, onClick, variant="primary", size="md", disabled, fullWidth, icon }) {
  const s = {
    primary:  { bg:`linear-gradient(135deg,${C.primary},${C.mid})`, color:C.white,    border:"none",              shadow:C.shadow },
    secondary:{ bg:C.white,    color:C.primary,   border:`2px solid ${C.primary}`,    shadow:"none" },
    ghost:    { bg:"transparent", color:C.textMuted, border:`1px solid ${C.border}`,  shadow:"none" },
    danger:   { bg:C.redLight, color:C.red,        border:`1px solid ${C.red}44`,     shadow:"none" },
    amber:    { bg:C.amberLight, color:C.amber,    border:`1px solid ${C.amber}55`,   shadow:"none" },
  }[variant] || {};
  const p = { sm:"7px 13px", md:"10px 20px", lg:"13px 28px" }[size];
  const fs = { sm:12, md:14, lg:15 }[size];
  return <button onClick={onClick} disabled={disabled} style={{ background:s.bg, color:s.color,
    border:s.border, borderRadius:8, padding:p, fontSize:fs, fontWeight:700,
    cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1,
    fontFamily:"'Noto Sans JP',sans-serif", display:"inline-flex", alignItems:"center",
    gap:6, width:fullWidth?"100%":"auto", justifyContent:"center",
    transition:"all 0.15s", boxShadow:s.shadow }}>{icon&&<span>{icon}</span>}{children}</button>;
}

function Card({ children, style={} }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`,
    borderRadius:14, padding:24, boxShadow:C.shadow, ...style }}>{children}</div>;
}

function SLabel({ children }) {
  return <div style={{ color:C.textMuted, fontSize:11, fontWeight:700,
    fontFamily:"'DM Mono',monospace", letterSpacing:"0.08em",
    textTransform:"uppercase", marginBottom:12 }}>{children}</div>;
}

function StageBar({ stage }) {
  return <div style={{ display:"flex", gap:3, alignItems:"center" }}>
    {STAGES.map(s => <div key={s.id} title={s.label} style={{ flex:1, height:7, borderRadius:4,
      background:s.id<=stage?s.color:C.borderLight }} />)}
    <span style={{ marginLeft:8, fontSize:13, color:C.textMuted,
      fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{stage}/7</span>
  </div>;
}

const INP = { padding:"11px 14px", border:`2px solid ${C.border}`, borderRadius:8,
  fontSize:14, fontFamily:"'Noto Sans JP',sans-serif", background:C.warm,
  color:C.text, width:"100%", boxSizing:"border-box" };
const EINP = { ...INP, border:`2px solid ${C.primary}55`, background:C.light };

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [resetSent,setResetSent]= useState(false);

  const go = async () => {
    if (!email.trim() || !password.trim()) {
      setError("メールアドレスとパスワードを入力してください"); return;
    }
    setLoading(true); setError("");

    // ── Real Supabase login ──────────────────────────────
    if (isConfigured) {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authErr) {
        setError("メールアドレスまたはパスワードが正しくありません");
        setLoading(false); return;
      }
      // Fetch the user's profile + org
      const { data: profile } = await supabase
        .from("profiles")
        .select("*, organizations(*)")
        .eq("id", data.user.id)
        .single();
      setLoading(false);
      onLogin({
        user: { id:data.user.id, name:profile?.name||data.user.email,
                email:data.user.email, role:profile?.role||"pm" },
        org: profile?.organizations ?? { name: data.user.email, plan: "starter" },
      });
      return;
    }

    // ── Demo fallback (no Supabase configured) ───────────
    setTimeout(() => {
      setLoading(false);
      onLogin({
        user: { id:"demo", name:email||"デモユーザー", email:email||"demo@eia-toolkit.jp", role:"admin" },
        org: ORGS[0]
      });
    }, 900);
  };

  const resetPassword = async () => {
    if (!email.trim()) { setError("パスワードリセットにはメールアドレスが必要です"); return; }
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/?reset=1",
    });
    setResetSent(true);
  };

  return <div style={{ minHeight:"100vh", background:C.bg, display:"flex",
    alignItems:"center", justifyContent:"center" }}>
    <div style={{ width:460 }}>
      {/* Logo */}
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:14,
          background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:16, padding:"14px 24px", boxShadow:C.shadow }}>
          <div style={{ width:48, height:48, borderRadius:12,
            background:`linear-gradient(135deg,${C.primary},${C.mid})`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>🌿</div>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontSize:22, fontWeight:800, color:C.primary,
              fontFamily:"'Noto Serif JP',serif" }}>EIAツールキット</div>
            <div style={{ fontSize:11, color:C.textMuted,
              fontFamily:"'DM Mono',monospace", letterSpacing:"0.08em" }}>BY RECORTA LLC</div>
          </div>
        </div>
      </div>

      <Card style={{ padding:36 }}>
        <h2 style={{ color:C.text, fontSize:22, fontWeight:700, marginBottom:6,
          fontFamily:"'Noto Serif JP',serif" }}>ログイン</h2>
        <p style={{ color:C.textMuted, fontSize:14, marginBottom:28 }}>
          {isConfigured ? "アカウント情報を入力してください" : "デモモードで実行中"}
        </p>

        {/* Demo mode banner */}
        {!isConfigured && (
          <div style={{ marginBottom:18, padding:"12px 16px",
            background:"#FEF3C7", border:"1px solid #F59E0B",
            borderRadius:10, fontSize:13, color:"#92400E" }}>
            ⚠️ Supabase未設定 — デモモードで動作しています。データは保存されません。
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginBottom:18, padding:"12px 16px",
            background:C.redLight, border:`1px solid ${C.red}44`,
            borderRadius:10, fontSize:13, color:C.red }}>
            {error}
          </div>
        )}

        {/* Reset sent */}
        {resetSent && (
          <div style={{ marginBottom:18, padding:"12px 16px",
            background:C.light, border:`1px solid ${C.primary}44`,
            borderRadius:10, fontSize:13, color:C.primary }}>
            ✓ パスワードリセットメールを送信しました。メールをご確認ください。
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom:18 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:15,
            fontWeight:700, marginBottom:8 }}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&go()}
            placeholder="you@company.jp"
            autoComplete="email"
            style={{ ...INP, fontSize:15 }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom:8 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:15,
            fontWeight:700, marginBottom:8 }}>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&go()}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ ...INP, fontSize:15 }}
          />
        </div>

        <div style={{ textAlign:"right", marginBottom:24 }}>
          <span onClick={resetPassword}
            style={{ color:C.mid, fontSize:14, cursor:"pointer", fontWeight:600 }}>
            パスワードを忘れた方
          </span>
        </div>

        <Btn onClick={go} fullWidth size="lg" disabled={loading}>
          {loading ? "ログイン中..." : "ログイン →"}
        </Btn>
      </Card>

      <p style={{ textAlign:"center", marginTop:20, color:C.textFaint, fontSize:13 }}>
        アカウントをお持ちでない方は管理者にお問い合わせください
      </p>
    </div>
  </div>;
}

// ─── HEADER ───────────────────────────────────────────────────────────────────
function Header({ org, currentUser, onLogout, onOpenProfile, setActive }) {
  const [menu, setMenu] = useState(false);
  const role = ROLE_CFG[currentUser?.role||"pm"];
  const initials = (currentUser?.name||"?").slice(0,1);
  return <div style={{ height:64, background:C.surface, borderBottom:`1px solid ${C.border}`,
    display:"flex", alignItems:"center", padding:"0 28px",
    position:"sticky", top:0, zIndex:100, boxShadow:C.shadow, gap:16 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:16 }}>
      <div style={{ width:36, height:36, borderRadius:9,
        background:`linear-gradient(135deg,${C.primary},${C.mid})`,
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🌿</div>
      <div>
        <div style={{ fontSize:16, fontWeight:800, color:C.primary,
          fontFamily:"'Noto Serif JP',serif", lineHeight:1 }}>EIAツールキット</div>
        <div style={{ fontSize:10, color:C.textMuted,
          fontFamily:"'DM Mono',monospace", letterSpacing:"0.06em" }}>RECORTA</div>
      </div>
    </div>
    {org && <div style={{ background:C.light, border:`1px solid ${C.primary}33`,
      borderRadius:8, padding:"7px 14px", display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ width:8, height:8, borderRadius:"50%", background:C.mid }} />
      <span style={{ color:C.primary, fontSize:14, fontWeight:600 }}>{org.name}</span>
      <Chip color={PLANS[org.plan]?.color||C.primary}>{PLANS[org.plan]?.label}</Chip>
    </div>}
    <div style={{ flex:1 }} />
    <div style={{ position:"relative" }}>
      <div onClick={()=>setMenu(!menu)} style={{ display:"flex", alignItems:"center",
        gap:10, cursor:"pointer", padding:"7px 12px", borderRadius:8,
        background:menu?C.bg:"transparent", border:`1px solid ${menu?C.border:"transparent"}` }}>
        <div style={{ width:38, height:38, borderRadius:"50%",
          background:`linear-gradient(135deg,${C.primary},${C.blue})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          color:C.white, fontWeight:700, fontSize:15 }}>{initials}</div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{currentUser?.name||"―"}</div>
          <Chip color={role.color} bg={role.badge} size={10}>{role.label}</Chip>
        </div>
        <span style={{ color:C.textMuted }}>▾</span>
      </div>
      {menu && <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)",
        background:C.surface, border:`1px solid ${C.border}`,
        borderRadius:12, boxShadow:C.shadowMd, width:230, overflow:"hidden", zIndex:200 }}>
        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.borderLight}`, background:C.bg }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{currentUser?.name}</div>
          <div style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>{currentUser?.email}</div>
        </div>
        {[
          { icon:"👤", label:"プロフィール設定", action:()=>{ setMenu(false); onOpenProfile("profile"); } },
          { icon:"🔒", label:"パスワード変更",   action:()=>{ setMenu(false); onOpenProfile("password"); } },
          { icon:"⚙️", label:"アカウント管理",   action:()=>{ setMenu(false); setActive("account"); } },
        ].map(item=>(
          <div key={item.label} onClick={item.action}
            style={{ padding:"13px 16px", cursor:"pointer", fontSize:14, color:C.text,
              borderBottom:`1px solid ${C.borderLight}`, display:"flex", alignItems:"center", gap:10 }}
            onMouseEnter={e=>e.currentTarget.style.background=C.bg}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            {item.icon} {item.label}
          </div>
        ))}
        <div onClick={onLogout} style={{ padding:"13px 16px", cursor:"pointer",
          fontSize:14, color:C.red, fontWeight:700, display:"flex", alignItems:"center", gap:10 }}
          onMouseEnter={e=>e.currentTarget.style.background=C.redLight}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          ↩️ ログアウト
        </div>
      </div>}
    </div>
  </div>;
}


// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ active, setActive }) {
  const nav = [
    { id:"dashboard",  icon:"◉",  label:"ダッシュボード" },
    { id:"scoping",    icon:"⬡",  label:"スコーピング・調査設計" },
    { id:"species",    icon:"🌿", label:"種・生息地データ" },
    { id:"reports",    icon:"📋", label:"報告書生成" },
    { id:"compliance", icon:"⚖️", label:"法令ライブラリ" },
    { id:"monitoring", icon:"📊", label:"事後モニタリング" },
    { id:"account",    icon:"🏢", label:"アカウント管理" },
  ];
  return <div style={{ width:236, background:C.surface, borderRight:`1px solid ${C.border}`,
    height:"calc(100vh - 64px)", position:"sticky", top:64, flexShrink:0,
    display:"flex", flexDirection:"column" }}>
    <nav style={{ flex:1, padding:"14px 0", overflowY:"auto" }}>
      {nav.map((item,i) => <>
        {i===6 && <div key="sep" style={{ padding:"14px 20px 6px", color:C.textFaint,
          fontSize:10, fontWeight:700, fontFamily:"'DM Mono',monospace",
          letterSpacing:"0.1em", textTransform:"uppercase" }}>設定</div>}
        <button key={item.id} onClick={()=>setActive(item.id)} style={{
          width:"100%", display:"flex", alignItems:"center", gap:12,
          padding:"13px 22px", background:active===item.id?C.light:"transparent",
          border:"none", borderLeft:`3px solid ${active===item.id?C.primary:"transparent"}`,
          color:active===item.id?C.primary:C.textMid, cursor:"pointer",
          textAlign:"left", fontSize:14, fontWeight:active===item.id?700:400,
          fontFamily:"'Noto Sans JP',sans-serif", transition:"all 0.15s" }}
          onMouseEnter={e=>{if(active!==item.id)e.currentTarget.style.background=C.bg;}}
          onMouseLeave={e=>{if(active!==item.id)e.currentTarget.style.background="transparent";}}>
          <span style={{ fontSize:17, width:22, textAlign:"center" }}>{item.icon}</span>
          {item.label}
        </button>
      </>)}
    </nav>
    {/* Mobile sync status - subtle, not promotional */}
    <div style={{ padding:"12px 18px", borderTop:`1px solid ${C.borderLight}`,
      display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ width:7, height:7, borderRadius:"50%", background:"#059669",
        flexShrink:0, boxShadow:"0 0 0 2px #D1FAE5" }} />
      <span style={{ color:C.textFaint, fontSize:11 }}>モバイル同期中</span>
    </div>
  </div>;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ projects, setSelectedProject, setActive, onNew, onDelete, currentUser }) {
  const totalSpecies = projects.reduce((a,b) => a + b.species.length, 0);
  const totalRL = projects.reduce((a,b) => a + b.redListCount, 0);
  const urgent = projects.filter(p => Math.floor((new Date(p.deadline)-new Date())/86400000)<60).length;
  return <div>
    <div style={{ display:"flex", justifyContent:"space-between",
      alignItems:"flex-start", marginBottom:28 }}>
      <div>
        <h1 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
          fontSize:28, fontWeight:700, margin:"0 0 6px" }}>プロジェクト一覧</h1>
        <p style={{ color:C.textMuted, fontSize:14 }}>進行中の環境影響評価 — 2026年3月</p>
      </div>
      <Btn onClick={onNew} icon="＋" size="lg">新規プロジェクト</Btn>
    </div>

    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:28 }}>
      {[
        { l:"進行中",      v:projects.length, u:"件", c:C.primary, bg:C.light },
        { l:"確認種総数",  v:totalSpecies,    u:"種", c:C.blue,   bg:C.blueLight },
        { l:"レッドリスト",v:totalRL,         u:"種", c:C.amber,  bg:C.amberLight },
        { l:"期限注意",    v:urgent,          u:"件", c:C.red,    bg:C.redLight },
      ].map(s => <div key={s.l} style={{ background:s.bg, border:`1px solid ${s.c}33`,
        borderRadius:12, padding:"18px 20px" }}>
        <div style={{ color:s.c, fontSize:11, fontWeight:700,
          fontFamily:"'DM Mono',monospace", letterSpacing:"0.06em", marginBottom:8 }}>{s.l}</div>
        <div style={{ color:s.c, fontSize:36, fontWeight:800, lineHeight:1 }}>
          {s.v}<span style={{ fontSize:15, fontWeight:500, marginLeft:4, opacity:0.7 }}>{s.u}</span>
        </div>
      </div>)}
    </div>

    <Card style={{ marginBottom:24, padding:"20px 24px" }}>
      <SLabel>法定7段階パイプライン</SLabel>
      <div style={{ display:"flex", gap:10 }}>
        {STAGES.map(s => {
          const n = projects.filter(p=>p.stage===s.id).length;
          return <div key={s.id} style={{ flex:1, background:n>0?`${s.color}10`:C.bg,
            border:`2px solid ${n>0?s.color+"66":C.borderLight}`,
            borderRadius:10, padding:"14px 6px", textAlign:"center" }}>
            <div style={{ color:n>0?s.color:C.textFaint, fontSize:28, fontWeight:800 }}>{n}</div>
            <div style={{ color:n>0?s.color:C.textFaint, fontSize:11, marginTop:4 }}>{s.short}</div>
          </div>;
        })}
      </div>
    </Card>

    <SLabel>プロジェクト一覧 ({projects.length}件)</SLabel>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:16 }}>
      {projects.map(p => <ProjectCard key={p.id} project={p}
        onClick={()=>{ setSelectedProject(p); setActive("project"); }}
        onDelete={["admin","pm"].includes(currentUser?.role) ? ()=>onDelete(p.id) : null}
      />)}
    </div>
  </div>;
}

function ProjectCard({ project, onClick, onDelete }) {
  const risk = RISK_CFG[project.risk];
  const days = Math.floor((new Date(project.deadline)-new Date())/86400000);
  const [hov, setHov] = useState(false);
  const cur = STAGES.find(s=>s.id===project.stage);
  // Next incomplete task in current stage
  const stageTasks = project.tasks[project.stage] || [];
  const nextTask = stageTasks.find(t=>!t.done);
  return <div onClick={onClick}
    onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    style={{ background:C.surface, border:`2px solid ${hov?C.primary:C.border}`,
      borderRadius:14, padding:"20px 22px", cursor:"pointer",
      transition:"all 0.2s", boxShadow:hov?C.shadowMd:C.shadow,
      transform:hov?"translateY(-2px)":"none", position:"relative" }}>
    <div style={{ position:"absolute", top:0, left:0, right:0, height:5,
      background:`linear-gradient(90deg,${C.primary} ${project.progress}%,${C.borderLight} ${project.progress}%)`,
      borderRadius:"14px 14px 0 0" }} />
    <div style={{ display:"flex", justifyContent:"space-between",
      alignItems:"flex-start", marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, flex:1 }}>
        <span style={{ fontSize:26 }}>{TYPE_ICONS[project.type]}</span>
        <div style={{ flex:1 }}>
          <div style={{ color:C.text, fontWeight:700, fontSize:16,
            fontFamily:"'Noto Sans JP',sans-serif", lineHeight:1.3 }}>{project.name}</div>
          <div style={{ color:C.textMuted, fontSize:13, marginTop:3 }}>{project.client}</div>
        </div>
      </div>
      <Chip color={risk.c} bg={risk.bg}>{risk.label}</Chip>
    </div>
    <StageBar stage={project.stage} />
    {/* Next action hint */}
    {nextTask && <div style={{ marginTop:12, padding:"8px 12px",
      background:C.bg, borderRadius:8,
      border:`1px solid ${cur?.color||C.border}33`,
      display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ color:cur?.color||C.amber, fontSize:12 }}>→</span>
      <span style={{ color:C.textMid, fontSize:12 }}>
        <strong style={{ color:cur?.color }}>次のタスク：</strong>{nextTask.label}
      </span>
    </div>}
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginTop:12 }}>
      {[
        { l:"確認種",     v:project.species.length, u:"種", c:C.blue   },
        { l:"RL記載",    v:project.redListCount,   u:"種", c:C.amber  },
        { l:"期限まで",  v:days,                   u:"日", c:days<60?C.red:C.text },
        { l:"進捗",      v:project.progress,       u:"%",  c:C.mid    },
      ].map(s => <div key={s.l} style={{ background:C.bg, borderRadius:8,
        padding:"9px 8px", textAlign:"center" }}>
        <div style={{ color:C.textMuted, fontSize:10, fontFamily:"'DM Mono',monospace", marginBottom:3 }}>{s.l}</div>
        <div style={{ color:s.c, fontSize:19, fontWeight:800, lineHeight:1 }}>
          {s.v}<span style={{ fontSize:11, fontWeight:500, opacity:0.7, marginLeft:1 }}>{s.u}</span>
        </div>
      </div>)}
    </div>
    <div style={{ display:"flex", justifyContent:"space-between",
      alignItems:"center", marginTop:12 }}>
      <div style={{ display:"flex", gap:6 }}>
        <Chip color={C.primary}>{project.pref}</Chip>
        <Chip color={C.textMuted}>{project.area} ha</Chip>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ color:C.textMuted, fontSize:13 }}>担当：{project.manager}</span>
        {onDelete && <Btn variant="danger" size="sm" onClick={e=>{
          e.stopPropagation();
          if(window.confirm(`「${project.name}」を削除してもよいですか？\nこの操作は元に戻せません。`)) onDelete();
        }}>削除</Btn>}
      </div>
    </div>
  </div>;
}

// ─── PROJECT DETAIL ───────────────────────────────────────────────────────────
function ProjectDetail({ project: initProject, setActive, onUpdate }) {
  const [project, setProject] = useState(initProject);
  const [tab, setTab] = useState("work"); // work | info | species | documents
  const [editingInfo, setEditingInfo] = useState(false);
  const [draft, setDraft] = useState({...initProject});
  const [saved, setSaved] = useState(false);
  const [addingSpecies, setAddingSpecies] = useState(false);
  const [newSp, setNewSp] = useState({...BLANK_SPECIES});
  const [editSpIdx, setEditSpIdx] = useState(null);
  const [comment, setComment] = useState("");
  const [mentionQuery, setMentionQuery] = useState(null); // null | string
  const [mentionAnchor, setMentionAnchor] = useState(0); // index of "@" in comment
  const [reportDone, setReportDone] = useState(false);
  const [reportProg, setReportProg] = useState(0);
  const [reportRunning, setReportRunning] = useState(false);

  const cur = STAGES.find(s=>s.id===project.stage);
  const stageTasks = project.tasks[project.stage] || [];
  const allDone = stageTasks.every(t=>t.done);
  const doneCount = stageTasks.filter(t=>t.done).length;
  const days = Math.floor((new Date(project.deadline)-new Date())/86400000);

  const push = (updated) => { setProject(updated); onUpdate(updated); };

  const toggleTask = (taskId) => {
    const newTasks = { ...project.tasks,
      [project.stage]: project.tasks[project.stage].map(t =>
        t.id===taskId ? {...t, done:!t.done} : t) };
    const allNowDone = newTasks[project.stage].every(t=>t.done);
    // recalculate progress
    const stagesCompleted = STAGES.filter(s => (s.id < project.stage) ||
      (s.id===project.stage && allNowDone)).length;
    const newProgress = Math.round((stagesCompleted / 7) * 100);
    push({ ...project, tasks:newTasks, progress:newProgress });
  };

  const advanceStage = () => {
    if (project.stage >= 7) return;
    const nextStage = project.stage + 1;
    const stagesCompleted = nextStage - 1;
    const newProgress = Math.round((stagesCompleted / 7) * 100);
    push({ ...project, stage:nextStage, progress:newProgress });
  };

  const saveInfo = () => {
    push({ ...project, ...draft }); setEditingInfo(false);
    setSaved(true); setTimeout(()=>setSaved(false),3000);
  };

  const addSpecies = () => {
    const isRL = ["CR","EN","VU","NT"].includes(newSp.status);
    const updated = { ...project,
      species: editSpIdx!==null
        ? project.species.map((s,i) => i===editSpIdx ? newSp : s)
        : [...project.species, {...newSp, id:Date.now()}],
      redListCount: 0 };
    updated.redListCount = updated.species.filter(s=>["CR","EN","VU","NT"].includes(s.status)).length;
    push(updated);
    setAddingSpecies(false); setNewSp({...BLANK_SPECIES}); setEditSpIdx(null);
  };

  const removeSpecies = (idx) => {
    const updated = { ...project, species: project.species.filter((_,i)=>i!==idx) };
    updated.redListCount = updated.species.filter(s=>["CR","EN","VU","NT"].includes(s.status)).length;
    push(updated);
  };

  const addComment = () => {
    if (!comment.trim()) return;
    const c = { id:Date.now(), text:comment, author:"田中 誠一", date:new Date().toLocaleDateString("ja-JP"), role:"pm" };
    push({ ...project, comments:[...project.comments, c] });
    setComment(""); setMentionQuery(null);
  };

  const handleCommentChange = (e) => {
    const val = e.target.value;
    setComment(val);
    // detect @mention trigger
    const caret = e.target.selectionStart;
    const textBeforeCaret = val.slice(0, caret);
    const atMatch = textBeforeCaret.match(/@([^\s@]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionAnchor(textBeforeCaret.lastIndexOf("@"));
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (member) => {
    const before = comment.slice(0, mentionAnchor);
    const after = comment.slice(mentionAnchor).replace(/@[^\s]*/, "");
    const newText = `${before}@${member.name} ${after}`;
    setComment(newText); setMentionQuery(null);
  };

  const filteredMembers = mentionQuery !== null
    ? TEAM.filter(m => m.name.includes(mentionQuery) || m.email.includes(mentionQuery)).slice(0,5)
    : [];

  // Render comment text with highlighted @mentions
  const renderCommentText = (text) => {
    const parts = text.split(/(@[\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef\u4e00-\u9fffA-Za-z0-9\s　]+?)(?=\s|$|@)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const name = part.slice(1).trim();
        const matched = TEAM.find(m => m.name === name);
        if (matched) {
          const r = ROLE_CFG[matched.role];
          return <span key={i} style={{ background:r.badge, color:r.color,
            borderRadius:4, padding:"1px 6px", fontWeight:700, fontSize:13 }}>{part}</span>;
        }
      }
      return <span key={i}>{part}</span>;
    });
  };

  const startReport = () => {
    setReportRunning(true); setReportProg(0); setReportDone(false);
    const iv = setInterval(()=>setReportProg(p=>{
      if(p>=100){ clearInterval(iv); setReportRunning(false); setReportDone(true); return 100; }
      return p+3; }), 70);
  };

  const TABS = [
    { id:"work",      label:"📋 作業・進捗" },
    { id:"info",      label:"📁 プロジェクト情報" },
    { id:"species",   label:`🌿 確認種リスト (${project.species.length})` },
    { id:"documents", label:"📄 文書管理" },
  ];

  return <div>
    {/* Header */}
    <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
      <Btn onClick={()=>setActive("dashboard")} variant="ghost" size="sm">← 一覧へ</Btn>
      <div style={{ flex:1 }}>
        <h1 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
          fontSize:22, fontWeight:700, margin:"0 0 4px" }}>
          {TYPE_ICONS[project.type]} {project.name}
        </h1>
        <div style={{ color:C.textMuted, fontSize:13 }}>
          {project.client} · {project.pref} · {project.area} ha · 担当：{project.manager}
        </div>
      </div>
      {saved && <Chip color={C.mid} bg={C.light}>✓ 保存しました</Chip>}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ padding:"8px 14px", background:days<60?C.redLight:C.light,
          border:`1px solid ${days<60?C.red+"44":C.primary+"33"}`,
          borderRadius:8, fontSize:13, fontWeight:700,
          color:days<60?C.red:C.primary }}>
          期限まで {days} 日
        </div>
      </div>
    </div>

    {/* Stage timeline */}
    <Card style={{ padding:"18px 24px", marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:14 }}>
        <SLabel>環境アセスメント法 — 法定7段階手続き</SLabel>
        {allDone && project.stage < 7 && (
          <Btn onClick={advanceStage} variant="primary" size="sm" icon="→">
            次の段階へ進む（{STAGES[project.stage]?.short}へ）
          </Btn>
        )}
      </div>
      <div style={{ display:"flex", gap:4 }}>
        {STAGES.map(s => <div key={s.id} style={{ flex:1 }}>
          <div style={{ background:s.id===project.stage?`${s.color}15`:s.id<project.stage?`${s.color}08`:C.bg,
            border:`${s.id===project.stage?2:1}px solid ${s.id<=project.stage?s.color+(s.id===project.stage?"":"88"):C.borderLight}`,
            borderRadius:10, padding:"10px 4px", textAlign:"center", position:"relative" }}>
            {s.id===project.stage && <div style={{ position:"absolute", top:-9, left:"50%",
              transform:"translateX(-50%)", background:s.color, color:C.white,
              fontSize:9, padding:"2px 7px", borderRadius:20, fontWeight:700,
              whiteSpace:"nowrap" }}>現在</div>}
            <div style={{ color:s.id<=project.stage?s.color:C.textFaint,
              fontSize:18, fontWeight:800 }}>{s.id}</div>
            <div style={{ color:s.id<=project.stage?s.color:C.textFaint,
              fontSize:10, marginTop:3, fontFamily:"'Noto Sans JP',sans-serif",
              fontWeight:s.id===project.stage?700:400 }}>{s.short}</div>
          </div>
        </div>)}
      </div>
    </Card>

    {/* Tabs */}
    <div style={{ display:"flex", borderBottom:`2px solid ${C.borderLight}`, marginBottom:20 }}>
      {TABS.map(t => <button key={t.id} onClick={()=>setTab(t.id)} style={{
        padding:"10px 22px", background:"none", border:"none",
        borderBottom:`3px solid ${tab===t.id?C.primary:"transparent"}`, marginBottom:-2,
        color:tab===t.id?C.primary:C.textMuted, cursor:"pointer",
        fontSize:14, fontWeight:tab===t.id?700:400,
        fontFamily:"'Noto Sans JP',sans-serif" }}>{t.label}</button>)}
    </div>

    {/* ── TAB: WORK ── */}
    {tab==="work" && <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:20 }}>
      <div>
        {/* Current stage context */}
        <div style={{ background:`${cur?.color}10`, border:`2px solid ${cur?.color}55`,
          borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ color:cur?.color, fontSize:15, fontWeight:700, marginBottom:4 }}>
                現在の段階：第{project.stage}段階 — {cur?.label}
              </div>
              <div style={{ color:C.textMid, fontSize:13, lineHeight:1.6 }}>{cur?.desc}</div>
            </div>
            <div style={{ textAlign:"right", flexShrink:0, marginLeft:20 }}>
              <div style={{ color:cur?.color, fontSize:28, fontWeight:800, lineHeight:1 }}>
                {doneCount}/{stageTasks.length}
              </div>
              <div style={{ color:C.textMuted, fontSize:11 }}>タスク完了</div>
            </div>
          </div>
          <div style={{ marginTop:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ color:cur?.color, fontSize:12, fontWeight:600 }}>段階内進捗</span>
              <span style={{ color:cur?.color, fontSize:12, fontWeight:700,
                fontFamily:"'DM Mono',monospace" }}>
                {Math.round((doneCount/stageTasks.length)*100)}%
              </span>
            </div>
            <div style={{ height:8, background:`${cur?.color}22`, borderRadius:4, overflow:"hidden" }}>
              <div style={{ height:"100%",
                width:`${Math.round((doneCount/stageTasks.length)*100)}%`,
                background:cur?.color, borderRadius:4, transition:"width 0.3s" }} />
            </div>
          </div>
        </div>

        {/* Task checklist */}
        <Card style={{ marginBottom:20 }}>
          <SLabel>この段階のタスクチェックリスト</SLabel>
          {stageTasks.map(task => <div key={task.id}
            style={{ display:"flex", alignItems:"center", gap:14,
              padding:"13px 0", borderBottom:`1px solid ${C.borderLight}`,
              cursor:"pointer" }} onClick={()=>toggleTask(task.id)}>
            <div style={{ width:24, height:24, borderRadius:6, flexShrink:0,
              background:task.done?C.primary:C.surface,
              border:`2px solid ${task.done?C.primary:C.border}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:C.white, fontSize:14, transition:"all 0.15s" }}>
              {task.done?"✓":""}
            </div>
            <span style={{ color:task.done?C.textMuted:C.text, fontSize:14,
              textDecoration:task.done?"line-through":"none" }}>{task.label}</span>
          </div>)}
          {allDone && project.stage < 7 && (
            <div style={{ marginTop:16, padding:"14px 16px",
              background:C.light, border:`1px solid ${C.primary}44`,
              borderRadius:10, display:"flex", justifyContent:"space-between",
              alignItems:"center" }}>
              <div>
                <div style={{ color:C.primary, fontWeight:700, fontSize:14 }}>
                  ✅ この段階の全タスクが完了しました
                </div>
                <div style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>
                  次の段階「{STAGES[project.stage]?.label}」へ進む準備ができています
                </div>
              </div>
              <Btn onClick={advanceStage} icon="→">次の段階へ</Btn>
            </div>
          )}
        </Card>

        {/* Stage 3 special: add species */}
        {project.stage === 3 && (
          <Card style={{ marginBottom:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:14 }}>
              <SLabel>現地調査 — 確認種を記録する</SLabel>
              <Btn onClick={()=>{ setAddingSpecies(true); setNewSp({...BLANK_SPECIES}); setEditSpIdx(null); }}
                icon="＋" size="sm">種を追加</Btn>
            </div>
            {project.species.length === 0
              ? <div style={{ padding:"32px", textAlign:"center", color:C.textFaint, fontSize:14 }}>
                  まだ確認種が記録されていません。「種を追加」から入力してください。
                </div>
              : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {project.species.map((sp, i) => {
                    const sc = STATUS_CFG[sp.status] || STATUS_CFG.LC;
                    return <div key={i} style={{ display:"flex", alignItems:"center",
                      gap:12, padding:"11px 14px", background:C.bg,
                      borderRadius:10, border:`1px solid ${C.borderLight}` }}>
                      <div style={{ flex:1 }}>
                        <div style={{ color:C.text, fontSize:14, fontWeight:700 }}>{sp.name}</div>
                        <div style={{ color:C.textMuted, fontSize:12, fontStyle:"italic", marginTop:1 }}>{sp.latin}</div>
                      </div>
                      <Chip color={C.blue} bg={C.blueLight} size={11}>{sp.type}</Chip>
                      <Chip color={sc.c} bg={sc.bg} size={11}>{sc.label}</Chip>
                      {sp.protected && <Chip color={C.red} bg={C.redLight} size={11}>保護指定</Chip>}
                      <span style={{ color:C.textMuted, fontSize:12,
                        fontFamily:"'DM Mono',monospace" }}>{sp.count}個体</span>
                      <Btn variant="ghost" size="sm" onClick={()=>{ setEditSpIdx(i); setNewSp({...sp}); setAddingSpecies(true); }}>編集</Btn>
                      <Btn variant="danger" size="sm" onClick={()=>removeSpecies(i)}>削除</Btn>
                    </div>;
                  })}
                </div>
            }
          </Card>
        )}

        {/* Stage 4/5/6: report generation */}
        {(project.stage===4||project.stage===5||project.stage===6) && (
          <Card style={{ marginBottom:20 }}>
            <SLabel>報告書生成</SLabel>
            <div style={{ color:C.textMid, fontSize:13, marginBottom:16, lineHeight:1.6 }}>
              現在の確認種データ（{project.species.length}種）をもとに、
              環境省・{project.pref}版書式に準拠した報告書を自動生成できます。
            </div>
            {!reportDone && <Btn onClick={startReport} disabled={reportRunning} icon="📋">
              {reportRunning ? "生成中..." : "報告書を今すぐ生成する"}
            </Btn>}
            {reportRunning && <div style={{ marginTop:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ color:C.textMuted, fontSize:13 }}>
                  {reportProg<30?"フィールドデータを読み込み中...":reportProg<60?"レッドリスト照合中...":reportProg<85?"書式を適用中...":"最終確認中..."}
                </span>
                <span style={{ color:C.primary, fontFamily:"'DM Mono',monospace",
                  fontSize:13, fontWeight:700 }}>{reportProg}%</span>
              </div>
              <div style={{ height:12, background:C.bg, borderRadius:6, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${reportProg}%`,
                  background:`linear-gradient(90deg,${C.primary},${C.mid})`,
                  borderRadius:6, transition:"width 0.1s" }} />
              </div>
            </div>}
            {reportDone && <div style={{ marginTop:14, padding:"16px 18px",
              background:C.light, border:`1px solid ${C.primary}44`, borderRadius:10 }}>
              <div style={{ color:C.primary, fontWeight:700, fontSize:14, marginBottom:10 }}>
                ✅ 報告書が生成されました
              </div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {[`${project.stage===6?"評価書":"準備書"}_生物多様性章.docx`,
                  `${project.stage===6?"評価書":"準備書"}_生物多様性章.pdf`,
                  `種リスト_${project.pref}版.xlsx`].map(f => (
                  <div key={f} style={{ background:C.surface, border:`1px solid ${C.border}`,
                    borderRadius:8, padding:"10px 14px", display:"flex",
                    alignItems:"center", gap:7, cursor:"pointer", boxShadow:C.shadow }}>
                    <span style={{ fontSize:18 }}>📄</span>
                    <span style={{ color:C.text, fontSize:12, fontWeight:500 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>}
          </Card>
        )}

        {/* Comments */}
        <Card>
          <SLabel>コメント・議事録</SLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
            {project.comments.length === 0
              ? <div style={{ color:C.textFaint, fontSize:13, padding:"12px 0" }}>
                  まだコメントはありません。<span style={{ color:C.primary }}>@名前</span> でメンバーをメンションできます。
                </div>
              : project.comments.map(c => {
                  const r = ROLE_CFG[c.role];
                  return <div key={c.id} style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <div style={{ width:28, height:28, borderRadius:"50%",
                        background:`linear-gradient(135deg,${C.primary},${C.blue})`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        color:C.white, fontWeight:700, fontSize:12 }}>{c.author[0]}</div>
                      <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{c.author}</span>
                      <Chip color={r.color} bg={r.badge} size={10}>{r.label}</Chip>
                      <span style={{ color:C.textFaint, fontSize:11, marginLeft:"auto" }}>{c.date}</span>
                    </div>
                    <div style={{ color:C.textMid, fontSize:13, lineHeight:1.7 }}>
                      {renderCommentText(c.text)}
                    </div>
                  </div>;
                })
            }
          </div>

          {/* Input with @mention dropdown */}
          <div style={{ position:"relative" }}>
            {/* Member picker dropdown */}
            {mentionQuery !== null && filteredMembers.length > 0 && (
              <div style={{ position:"absolute", bottom:"calc(100% + 6px)", left:0,
                background:C.surface, border:`1px solid ${C.border}`,
                borderRadius:10, boxShadow:C.shadowMd, overflow:"hidden",
                minWidth:260, zIndex:50 }}>
                <div style={{ padding:"7px 14px", background:C.bg,
                  borderBottom:`1px solid ${C.borderLight}`,
                  fontSize:11, color:C.textMuted, fontFamily:"'DM Mono',monospace",
                  fontWeight:700, letterSpacing:"0.06em" }}>
                  メンバーを選択
                </div>
                {filteredMembers.map(m => {
                  const r = ROLE_CFG[m.role];
                  return <div key={m.id} onClick={()=>insertMention(m)}
                    style={{ display:"flex", alignItems:"center", gap:10,
                      padding:"10px 14px", cursor:"pointer",
                      borderBottom:`1px solid ${C.borderLight}` }}
                    onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0,
                      background:`linear-gradient(135deg,${C.primary},${C.blue})`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      color:C.white, fontWeight:700, fontSize:12 }}>{m.name[0]}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ color:C.text, fontSize:13, fontWeight:700 }}>{m.name}</div>
                      <div style={{ color:C.textFaint, fontSize:11 }}>{m.email}</div>
                    </div>
                    <Chip color={r.color} bg={r.badge} size={10}>{r.label}</Chip>
                  </div>;
                })}
              </div>
            )}
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1, position:"relative" }}>
                <input value={comment} onChange={handleCommentChange}
                  placeholder="コメント・メモを入力… @名前 でメンション"
                  onKeyDown={e=>{
                    if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); addComment(); }
                    if(e.key==="Escape") setMentionQuery(null);
                  }}
                  style={{ ...INP, fontSize:14, width:"100%" }} />
              </div>
              <Btn onClick={addComment} disabled={!comment.trim()}>送信</Btn>
            </div>
            <div style={{ marginTop:6, fontSize:11, color:C.textFaint }}>
              @ を入力するとメンバー一覧が表示されます · Enter で送信
            </div>
          </div>
        </Card>
      </div>

      {/* Right panel — overview */}
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <Card>
          <SLabel>全体進捗</SLabel>
          <div style={{ marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ color:C.textMid, fontSize:14 }}>全7段階中</span>
              <span style={{ color:C.primary, fontSize:18, fontWeight:800 }}>{project.progress}%</span>
            </div>
            <div style={{ height:14, background:C.bg, borderRadius:7, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${project.progress}%`,
                background:`linear-gradient(90deg,${C.primary},${C.mid})`,
                borderRadius:7, transition:"width 0.4s" }} />
            </div>
          </div>
          {STAGES.map(s => {
            const done = project.stage > s.id;
            const current = project.stage === s.id;
            const stageDoneCount = (project.tasks[s.id]||[]).filter(t=>t.done).length;
            const stageTotalCount = (project.tasks[s.id]||[]).length;
            return <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10,
              padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
              <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0,
                background:done?C.primary:current?`${s.color}22`:C.bg,
                border:`2px solid ${done?C.primary:current?s.color:C.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:done?C.white:current?s.color:C.textFaint,
                fontSize:11, fontWeight:700 }}>{done?"✓":s.id}</div>
              <div style={{ flex:1 }}>
                <div style={{ color:done?C.textMuted:current?C.text:C.textFaint,
                  fontSize:13, fontWeight:current?700:400 }}>{s.short}</div>
              </div>
              <span style={{ color:done?C.mid:current?s.color:C.textFaint,
                fontSize:11, fontFamily:"'DM Mono',monospace" }}>
                {stageDoneCount}/{stageTotalCount}
              </span>
            </div>;
          })}
        </Card>

        <Card>
          <SLabel>生物多様性サマリー</SLabel>
          {[
            { l:"確認種数",    v:project.species.length,   u:"種", c:C.blue,   bg:C.blueLight },
            { l:"RL記載種",    v:project.redListCount,     u:"種", c:C.amber,  bg:C.amberLight },
            { l:"保護指定種",  v:project.species.filter(s=>s.protected).length, u:"種", c:C.red, bg:C.redLight },
          ].map(s => <div key={s.l} style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", padding:"10px 12px", background:s.bg,
            borderRadius:8, marginBottom:8 }}>
            <span style={{ color:s.c, fontSize:13, fontWeight:700 }}>{s.l}</span>
            <span style={{ color:s.c, fontSize:22, fontWeight:800 }}>
              {s.v}<span style={{ fontSize:12, fontWeight:500, marginLeft:1 }}>{s.u}</span>
            </span>
          </div>)}
          {project.stage===3 && <Btn onClick={()=>{ setAddingSpecies(true); setNewSp({...BLANK_SPECIES}); setEditSpIdx(null); }}
            fullWidth variant="secondary" icon="＋" size="sm">確認種を追加</Btn>}
        </Card>
      </div>
    </div>}

    {/* ── TAB: INFO ── */}
    {tab==="info" && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:16 }}>
          <SLabel>基本情報</SLabel>
          {editingInfo
            ? <div style={{ display:"flex", gap:8 }}>
                <Btn onClick={saveInfo} size="sm" icon="💾">保存</Btn>
                <Btn onClick={()=>{ setEditingInfo(false); setDraft({...project}); }} variant="ghost" size="sm">取消</Btn>
              </div>
            : <Btn onClick={()=>setEditingInfo(true)} variant="secondary" size="sm" icon="✏️">編集</Btn>}
        </div>
        {[
          { l:"プロジェクト名", k:"name", span:true },
          { l:"クライアント名", k:"client" },
          { l:"担当者",        k:"manager" },
          { l:"都道府県",      k:"pref" },
          { l:"事業面積 (ha)", k:"area" },
          { l:"提出期限",      k:"deadline", t:"date" },
          { l:"予算（円）",    k:"budget" },
        ].map(row => <div key={row.k} style={{ display:"flex", padding:"11px 0",
          borderBottom:`1px solid ${C.borderLight}`, alignItems:"center", gap:12 }}>
          <span style={{ width:150, color:C.textMuted, fontSize:14, flexShrink:0 }}>{row.l}</span>
          {editingInfo
            ? <input type={row.t||"text"} value={draft[row.k]||""}
                onChange={e=>setDraft(d=>({...d,[row.k]:e.target.value}))}
                style={EINP} />
            : <span style={{ color:C.text, fontSize:14, fontWeight:500 }}>
                {row.k==="budget"?`¥${Number(project[row.k]||0).toLocaleString()}`:project[row.k]}
              </span>}
        </div>)}
        <div style={{ marginTop:16 }}>
          <SLabel>事業概要</SLabel>
          {editingInfo
            ? <textarea value={draft.desc||""} rows={4}
                onChange={e=>setDraft(d=>({...d,desc:e.target.value}))}
                style={{ ...EINP, resize:"vertical" }} />
            : <p style={{ color:C.textMid, fontSize:14, lineHeight:1.75 }}>{project.desc}</p>}
        </div>
        {editingInfo && <Btn onClick={saveInfo} fullWidth icon="💾" style={{ marginTop:16 }}>変更を保存する</Btn>}
      </Card>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <Card>
          <SLabel>リスク・リスト・環境設定</SLabel>
          {[
            { l:"リスクレベル", v:<Chip color={RISK_CFG[project.risk].c} bg={RISK_CFG[project.risk].bg}>{RISK_CFG[project.risk].label}</Chip> },
            { l:"現在の段階",   v:<Chip color={cur?.color||C.primary}>{cur?.label}</Chip> },
            { l:"全体進捗",     v:<strong style={{ color:C.primary }}>{project.progress}%</strong> },
            { l:"期限まで",     v:<strong style={{ color:days<60?C.red:C.text }}>{days} 日</strong> },
          ].map(row => <div key={row.l} style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", padding:"10px 0",
            borderBottom:`1px solid ${C.borderLight}` }}>
            <span style={{ color:C.textMuted, fontSize:14 }}>{row.l}</span>
            {row.v}
          </div>)}
        </Card>
        <Card>
          <SLabel>プロジェクトメンバー</SLabel>
          {TEAM.slice(0,4).map(m => {
            const r = ROLE_CFG[m.role];
            return <div key={m.id} style={{ display:"flex", alignItems:"center",
              gap:10, padding:"8px 0", borderBottom:`1px solid ${C.borderLight}` }}>
              <div style={{ width:32, height:32, borderRadius:"50%",
                background:`linear-gradient(135deg,${C.primary},${C.blue})`,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:C.white, fontWeight:700, fontSize:13 }}>{m.name[0]}</div>
              <div style={{ flex:1 }}>
                <div style={{ color:C.text, fontSize:13, fontWeight:600 }}>{m.name}</div>
              </div>
              <Chip color={r.color} bg={r.badge} size={10}>{r.label}</Chip>
            </div>;
          })}
        </Card>
      </div>
    </div>}

    {/* ── TAB: SPECIES ── */}
    {tab==="species" && <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ color:C.text, fontSize:16, fontWeight:700 }}>
            確認種リスト — {project.species.length}種 記録済み
          </div>
          <div style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>
            環境省レッドリスト + {project.pref}版レッドリストと自動照合済み
          </div>
        </div>
        <Btn onClick={()=>{ setAddingSpecies(true); setNewSp({...BLANK_SPECIES}); setEditSpIdx(null); }}
          icon="＋">確認種を追加する</Btn>
      </div>
      {project.species.length===0
        ? <Card style={{ textAlign:"center", padding:56, border:`2px dashed ${C.border}`, boxShadow:"none" }}>
            <div style={{ fontSize:42, marginBottom:14 }}>🌿</div>
            <div style={{ color:C.textMuted, fontSize:15, marginBottom:16 }}>
              確認種がまだ記録されていません。<br/>フィールド調査後に「確認種を追加する」ボタンから入力してください。
            </div>
            <Btn onClick={()=>{ setAddingSpecies(true); setNewSp({...BLANK_SPECIES}); setEditSpIdx(null); }}
              icon="＋">最初の確認種を追加</Btn>
          </Card>
        : <Card style={{ padding:0, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:C.bg }}>
                {["種名（和名）","学名","分類","カテゴリ","保護指定","個体数","場所","記録日","操作"].map(h=>(
                  <th key={h} style={{ padding:"10px 14px", textAlign:"left",
                    color:C.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace",
                    fontWeight:700, borderBottom:`1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {project.species.map((sp, i) => {
                  const sc = STATUS_CFG[sp.status] || STATUS_CFG.LC;
                  return <tr key={i} style={{ borderBottom:`1px solid ${C.borderLight}`,
                    background:sp.protected?`${C.redLight}44`:"transparent" }}>
                    <td style={{ padding:"12px 14px", color:C.text, fontSize:14, fontWeight:700 }}>{sp.name}</td>
                    <td style={{ padding:"12px 14px", color:C.textMuted, fontSize:12, fontStyle:"italic" }}>{sp.latin||"—"}</td>
                    <td style={{ padding:"12px 14px" }}><Chip color={C.blue} bg={C.blueLight} size={11}>{sp.type}</Chip></td>
                    <td style={{ padding:"12px 14px" }}><Chip color={sc.c} bg={sc.bg} size={11}>{sc.label}</Chip></td>
                    <td style={{ padding:"12px 14px" }}>
                      {sp.protected ? <Chip color={C.red} bg={C.redLight} size={11}>保護指定</Chip>
                        : <span style={{ color:C.textFaint, fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ padding:"12px 14px", color:C.text, fontSize:13,
                      fontFamily:"'DM Mono',monospace" }}>{sp.count}</td>
                    <td style={{ padding:"12px 14px", color:C.textMuted, fontSize:12 }}>{sp.location||"—"}</td>
                    <td style={{ padding:"12px 14px", color:C.textMuted, fontSize:12 }}>{sp.date||"—"}</td>
                    <td style={{ padding:"12px 14px" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <Btn variant="ghost" size="sm"
                          onClick={()=>{ setEditSpIdx(i); setNewSp({...sp}); setAddingSpecies(true); }}>編集</Btn>
                        <Btn variant="danger" size="sm" onClick={()=>removeSpecies(i)}>削除</Btn>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </Card>
      }
    </div>}

    {/* ── TAB: DOCUMENTS ── */}
    {tab==="documents" && <div>
      <div style={{ marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ color:C.text, fontSize:16, fontWeight:700 }}>文書管理</div>
        <Btn onClick={startReport} disabled={reportRunning} icon="📋" variant="secondary">
          報告書を生成する
        </Btn>
      </div>
      {[
        { name:"配慮書（生物多様性章）.docx",    size:"2.4 MB", date:"2025-11-12", status:"提出済", done:project.stage>1 },
        { name:"方法書_生物多様性調査計画.pdf",   size:"5.8 MB", date:"2026-01-08", status:"提出済", done:project.stage>2 },
        { name:"現地調査データ.xlsx",             size:project.species.length>0?"1.2 MB":"—", date:project.species.length>0?"2026-03-01":"—", status:project.stage>3?"提出済":project.stage===3&&project.species.length>0?"作成中":"未作成", done:project.stage>3 },
        { name:"準備書_生物多様性章.docx",        size:"—", date:"—", status:project.stage>=4&&reportDone?"完成":project.stage>=4?"生成可能":"未作成", done:false },
        { name:"TNFD_LEAP整合出力.pdf",           size:"—", date:"—", status:"未作成", done:false },
      ].map((doc,i) => <div key={i} style={{ display:"flex", alignItems:"center",
        gap:14, padding:"13px 16px", background:C.bg,
        borderRadius:10, marginBottom:8,
        border:`1px solid ${doc.done?C.primary+"33":C.borderLight}` }}>
        <span style={{ fontSize:22 }}>📄</span>
        <div style={{ flex:1 }}>
          <div style={{ color:C.text, fontSize:14, fontWeight:500 }}>{doc.name}</div>
          <div style={{ color:C.textFaint, fontSize:12, marginTop:2 }}>{doc.size} · {doc.date}</div>
        </div>
        <Chip
          color={doc.status==="提出済"||doc.status==="完成"?C.mid:doc.status==="作成中"||doc.status==="生成可能"?C.amber:C.textMuted}
          bg={doc.status==="提出済"||doc.status==="完成"?C.light:doc.status==="作成中"||doc.status==="生成可能"?C.amberLight:C.bg}>
          {doc.status}
        </Chip>
      </div>)}
    </div>}

    {/* ── ADD/EDIT SPECIES MODAL ── */}
    {addingSpecies && <div style={{ position:"fixed", inset:0,
      background:"rgba(0,0,0,0.45)", zIndex:500,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:C.surface, borderRadius:16, padding:"32px 36px",
        width:560, maxHeight:"88vh", overflowY:"auto",
        boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
        <h2 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
          fontSize:20, fontWeight:700, marginBottom:22 }}>
          {editSpIdx!==null ? "確認種を編集" : "確認種を新規追加"}
        </h2>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
          {[
            { l:"種名（和名）*", k:"name", span:true },
            { l:"学名",          k:"latin" },
            { l:"個体数",        k:"count", t:"number" },
          ].map(f => <div key={f.k} style={{ gridColumn:f.span?"1/-1":"auto" }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:7 }}>{f.l}</label>
            <input type={f.t||"text"} value={newSp[f.k]}
              onChange={e=>setNewSp(p=>({...p,[f.k]:f.t==="number"?+e.target.value:e.target.value}))}
              style={{ ...INP, fontSize:14 }} />
          </div>)}
          <div>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:7 }}>分類群</label>
            <select value={newSp.type}
              onChange={e=>setNewSp(p=>({...p,type:e.target.value}))}
              style={{ ...INP, fontSize:14 }}>
              {["植物","哺乳類","鳥類","両生類","爬虫類","魚類","昆虫類","甲殻類","その他"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:7 }}>レッドリストカテゴリ</label>
            <select value={newSp.status}
              onChange={e=>setNewSp(p=>({...p,status:e.target.value}))}
              style={{ ...INP, fontSize:14 }}>
              {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{k} — {v.label}</option>)}
              <option value="LC">LC — 軽度懸念（非掲載）</option>
            </select>
          </div>
          {[
            { l:"確認場所・地点名", k:"location", span:true },
            { l:"確認年月日",       k:"date", t:"date" },
          ].map(f => <div key={f.k} style={{ gridColumn:f.span?"1/-1":"auto" }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:7 }}>{f.l}</label>
            <input type={f.t||"text"} value={newSp[f.k]}
              onChange={e=>setNewSp(p=>({...p,[f.k]:e.target.value}))}
              style={{ ...INP, fontSize:14 }} />
          </div>)}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:7 }}>メモ・行動・状態</label>
            <textarea value={newSp.notes}
              onChange={e=>setNewSp(p=>({...p,notes:e.target.value}))}
              rows={2} style={{ ...INP, fontSize:14, resize:"vertical" }} />
          </div>
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:10,
          cursor:"pointer", marginBottom:22, padding:"12px 16px",
          background:newSp.protected?C.redLight:C.bg,
          border:`2px solid ${newSp.protected?C.red+"55":C.border}`,
          borderRadius:8 }}>
          <div onClick={()=>setNewSp(p=>({...p,protected:!p.protected}))}
            style={{ width:22, height:22, borderRadius:5, flexShrink:0,
              background:newSp.protected?C.red:C.surface,
              border:`2px solid ${newSp.protected?C.red:C.border}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:C.white, fontSize:13 }}>{newSp.protected?"✓":""}</div>
          <div>
            <div style={{ color:C.text, fontSize:14, fontWeight:700 }}>保護指定種</div>
            <div style={{ color:C.textMuted, fontSize:12 }}>
              種の保存法・鳥獣保護管理法等による指定種の場合チェック
            </div>
          </div>
        </label>
        <div style={{ display:"flex", gap:10 }}>
          <Btn fullWidth onClick={addSpecies} disabled={!newSp.name.trim()}>
            {editSpIdx!==null ? "変更を保存する" : "確認種を追加する"}
          </Btn>
          <Btn variant="ghost" onClick={()=>{ setAddingSpecies(false); setNewSp({...BLANK_SPECIES}); setEditSpIdx(null); }}>
            キャンセル
          </Btn>
        </div>
      </div>
    </div>}
  </div>;
}

// ─── NEW PROJECT MODAL ────────────────────────────────────────────────────────
function NewProjectModal({ onSave, onCancel }) {
  const [d, setD] = useState({
    name:"", client:"", type:"wind", pref:"東京都",
    deadline:"2027-03-31", area:"", budget:"",
    desc:"", manager:"田中 誠一", risk:"low"
  });
  const f = k => e => setD(p => ({...p,[k]:e.target.value}));

  return <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)",
    zIndex:500, display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ background:C.surface, borderRadius:16, padding:"32px 36px",
      width:580, maxHeight:"90vh", overflowY:"auto",
      boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
      <h2 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
        fontSize:22, fontWeight:700, marginBottom:8 }}>新規プロジェクトを作成</h2>
      <p style={{ color:C.textMuted, fontSize:14, marginBottom:24 }}>
        作成後、プロジェクト詳細画面で第1段階（配慮書）からタスクを進めることができます
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
        {[
          { l:"プロジェクト名*", k:"name", span:true, ph:"例：○○山系太陽光発電EIA" },
          { l:"クライアント名*", k:"client", ph:"例：○○株式会社" },
          { l:"担当者",          k:"manager" },
        ].map(f2 => <div key={f2.k} style={{ gridColumn:f2.span?"1/-1":"auto" }}>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>{f2.l}</label>
          <input value={d[f2.k]} onChange={f(f2.k)} placeholder={f2.ph||""}
            style={{ ...INP, fontSize:14 }} />
        </div>)}

        <div>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>事業種別*</label>
          <select value={d.type} onChange={f("type")} style={{ ...INP, fontSize:14 }}>
            {[["wind","💨 風力発電"],["solar","☀️ 太陽光発電"],["road","🛣️ 道路"],
              ["dam","🌊 ダム"],["rail","🚄 鉄道"],["port","⚓ 港湾"]].map(([v,l])=>(
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>都道府県*</label>
          <select value={d.pref} onChange={f("pref")} style={{ ...INP, fontSize:14 }}>
            {["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
              "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
              "新潟県","富山県","石川県","福井県","山梨県","長野県",
              "岐阜県","静岡県","愛知県","三重県",
              "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
              "鳥取県","島根県","岡山県","広島県","山口県",
              "徳島県","香川県","愛媛県","高知県",
              "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
            ].map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>事業面積 (ha)</label>
          <input value={d.area} onChange={f("area")} placeholder="例：500" style={{ ...INP, fontSize:14 }} />
        </div>
        <div>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>提出期限</label>
          <input type="date" value={d.deadline} onChange={f("deadline")} style={{ ...INP, fontSize:14 }} />
        </div>
        <div>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>リスクレベル</label>
          <select value={d.risk} onChange={f("risk")} style={{ ...INP, fontSize:14 }}>
            <option value="low">低リスク</option>
            <option value="medium">中リスク</option>
            <option value="high">高リスク</option>
          </select>
        </div>
        <div>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>予算（円）</label>
          <input value={d.budget} onChange={f("budget")} placeholder="例：5000000" style={{ ...INP, fontSize:14 }} />
        </div>
      </div>

      <div style={{ marginBottom:24 }}>
        <label style={{ display:"block", color:C.textMid, fontSize:14,
          fontWeight:700, marginBottom:7 }}>事業概要</label>
        <textarea value={d.desc} onChange={f("desc")} rows={3}
          placeholder="事業の目的・場所・規模などを簡潔に記入してください"
          style={{ ...INP, fontSize:14, resize:"vertical" }} />
      </div>

      <div style={{ background:C.light, border:`1px solid ${C.primary}33`,
        borderRadius:10, padding:"12px 16px", marginBottom:20 }}>
        <div style={{ color:C.primary, fontSize:13, fontWeight:700, marginBottom:4 }}>
          📋 作成後の流れ
        </div>
        <div style={{ color:C.textMid, fontSize:13, lineHeight:1.65 }}>
          プロジェクトが作成されると <strong>第1段階（配慮書手続）</strong> から開始します。
          各段階でタスクをチェックし、全タスク完了後に次の段階へ進めます。
          第3段階（現地調査）では確認種を直接入力できます。
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <Btn fullWidth size="lg"
          disabled={!d.name.trim()||!d.client.trim()}
          onClick={()=>onSave({
            ...d, id:Date.now(), stage:1, species:[], redListCount:0, progress:0,
            tasks:{1:makeInitialTasks(1),2:makeInitialTasks(2),3:makeInitialTasks(3),
                   4:makeInitialTasks(4),5:makeInitialTasks(5),6:makeInitialTasks(6),7:makeInitialTasks(7)},
            comments:[], documents:[]
          })}>
          プロジェクトを作成する →
        </Btn>
        <Btn variant="ghost" size="lg" onClick={onCancel}>キャンセル</Btn>
      </div>
    </div>
  </div>;
}

// ─── SCOPING MODULE ───────────────────────────────────────────────────────────
function ScopingModule() {
  const [pType,setPType]=useState("wind");
  const [pref,setPref]=useState("北海道");
  const [done,setDone]=useState(false);
  const rows=[
    {g:"植物",          m:["植生図作成","希少種重点調査"],          s:["春・夏・秋"],p:"高"},
    {g:"哺乳類",        m:["自動撮影カメラ","フィールドサイン調査"],s:["通年"],      p:"高"},
    {g:"鳥類（繁殖期）",m:["ラインセンサス","定点観察"],            s:["4〜7月"],    p:"高"},
    {g:"鳥類（越冬期）",m:["ラインセンサス","定点観察"],            s:["11〜2月"],   p:"中"},
    {g:"両生類・爬虫類",m:["直接観察","トラップ調査"],              s:["春・夏"],    p:"中"},
    {g:"魚類",          m:["電気ショッカー","投網"],                 s:["春・夏・秋"],p:"低"},
    {g:"昆虫類",        m:["ライトトラップ","スイーピング"],         s:["夏"],        p:"中"},
  ];
  return <div>
    <h1 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
      fontSize:28, fontWeight:700, margin:"0 0 6px" }}>スコーピング・調査設計</h1>
    <p style={{ color:C.textMuted, fontSize:14, marginBottom:28 }}>
      環境省技術指針に基づき、調査対象・手法・スケジュールを自動提案します
    </p>
    <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:24 }}>
      <Card style={{ height:"fit-content" }}>
        <SLabel>事業条件を入力</SLabel>
        {[
          { l:"事業種別", el:<select value={pType} onChange={e=>setPType(e.target.value)} style={{ ...INP,fontSize:14 }}>
            {[["wind","風力発電"],["solar","太陽光"],["road","道路"],["dam","ダム"],["rail","鉄道"],["port","港湾"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select> },
          { l:"都道府県", el:<select value={pref} onChange={e=>setPref(e.target.value)} style={{ ...INP,fontSize:14 }}>
            {["北海道","東京都","大阪府","愛知県","福岡県","沖縄県","長野県"].map(p=><option key={p}>{p}</option>)}</select> },
        ].map(f2 => <div key={f2.l} style={{ marginBottom:16 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:14,
            fontWeight:700, marginBottom:7 }}>{f2.l}</label>
          {f2.el}
        </div>)}
        <Btn fullWidth onClick={()=>setDone(true)} size="lg">調査計画を自動生成 →</Btn>
      </Card>
      {done ? <div>
        <div style={{ background:C.light, border:`1px solid ${C.primary}44`,
          borderRadius:12, padding:"13px 18px", marginBottom:16,
          display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20 }}>✅</span>
          <div style={{ flex:1 }}>
            <div style={{ color:C.primary, fontSize:14, fontWeight:700 }}>調査計画を生成しました</div>
            <div style={{ color:C.textMuted, fontSize:13 }}>環境省技術指針 + {pref}版レッドリストに基づいて自動生成</div>
          </div>
          <Btn variant="secondary" size="sm" icon="📄">PDF出力</Btn>
        </div>
        <Card style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:C.bg }}>
              {["調査グループ","推奨調査手法","実施時期","優先度"].map(h=>(
                <th key={h} style={{ padding:"11px 16px", textAlign:"left",
                  color:C.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace",
                  borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{rows.map((r,i)=>(
              <tr key={i} style={{ borderBottom:`1px solid ${C.borderLight}` }}>
                <td style={{ padding:"12px 16px",color:C.text,fontSize:14,fontWeight:700 }}>{r.g}</td>
                <td style={{ padding:"12px 16px" }}><div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                  {r.m.map(m=><Chip key={m} color={C.textMuted}>{m}</Chip>)}
                </div></td>
                <td style={{ padding:"12px 16px",color:C.textMuted,fontSize:13 }}>{r.s.join(", ")}</td>
                <td style={{ padding:"12px 16px" }}>
                  <Chip color={r.p==="高"?C.red:r.p==="中"?C.amber:C.textMuted}
                    bg={r.p==="高"?C.redLight:r.p==="中"?C.amberLight:C.bg}>{r.p}</Chip>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </div> : <div style={{ background:C.surface, border:`2px dashed ${C.border}`,
        borderRadius:14, padding:64, textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:14 }}>⬡</div>
        <div style={{ color:C.textMuted, fontSize:15, lineHeight:1.7 }}>
          左の条件を選択して<br/>「調査計画を自動生成」ボタンを押してください
        </div>
      </div>}
    </div>
  </div>;
}

// ─── REPORT MODULE ────────────────────────────────────────────────────────────
function ReportModule() {
  const [prog,setProg]=useState(0);
  const [running,setRunning]=useState(false);
  const [done,setDone]=useState(false);
  const start=()=>{setRunning(true);setProg(0);setDone(false);
    const iv=setInterval(()=>setProg(p=>{if(p>=100){clearInterval(iv);setRunning(false);setDone(true);return 100;}return p+3;}),70);};
  return <div>
    <h1 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
      fontSize:28, fontWeight:700, margin:"0 0 6px" }}>報告書生成</h1>
    <p style={{ color:C.textMuted, fontSize:14, marginBottom:28 }}>
      確認種データから評価書・準備書の生物多様性章をワンクリックで生成
    </p>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:14, marginBottom:24 }}>
      {[
        {t:"環境省・国交省標準EIS",  d:"生物多様性章（Word + PDF）",  icon:"🏛️",ok:true},
        {t:"都道府県別行政書式",      d:"47都道府県フォーマット対応",  icon:"📍",ok:true},
        {t:"TNFD LEAP整合出力",      d:"投資家向け自然関連情報開示",  icon:"📊",ok:true},
        {t:"公聴会用サマリー資料",   d:"市民向け生物多様性概要",      icon:"👥",ok:false},
      ].map(c=><Card key={c.t} style={{ opacity:c.ok?1:0.55 }}>
        <div style={{ display:"flex",gap:14,alignItems:"center" }}>
          <span style={{ fontSize:28 }}>{c.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ color:C.text,fontSize:14,fontWeight:700 }}>{c.t}</div>
            <div style={{ color:C.textMuted,fontSize:13,marginTop:2 }}>{c.d}</div>
          </div>
          <div style={{ width:11,height:11,borderRadius:"50%",
            background:c.ok?C.mid:C.textFaint,flexShrink:0 }}/>
        </div>
      </Card>)}
    </div>
    <Card>
      <SLabel>出力設定</SLabel>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22 }}>
        {[{l:"対象プロジェクト",v:"プロジェクトを選択…"},{l:"報告書種別",v:"準備書 第4章 生物多様性"},{l:"都道府県書式",v:"都道府県を選択…"}].map(f=>(
          <div key={f.l}>
            <div style={{ color:C.textMid,fontSize:14,fontWeight:700,marginBottom:6 }}>{f.l}</div>
            <div style={{ background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px 14px",color:C.textMuted,fontSize:14 }}>{f.v}</div>
          </div>
        ))}
      </div>
      {!done&&<Btn onClick={start} disabled={running} size="lg" icon="📋">
        {running?"生成中...":"報告書を生成する"}</Btn>}
      {running&&<div style={{ marginTop:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
          <span style={{ color:C.textMuted,fontSize:14 }}>
            {prog<30?"フィールドデータを読み込み中...":prog<60?"レッドリスト照合中...":prog<85?"書式を適用中...":"最終確認中..."}
          </span>
          <span style={{ color:C.primary,fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700 }}>{prog}%</span>
        </div>
        <div style={{ height:14,background:C.bg,borderRadius:7,overflow:"hidden" }}>
          <div style={{ height:"100%",width:`${prog}%`,
            background:`linear-gradient(90deg,${C.primary},${C.mid})`,borderRadius:7,transition:"width 0.1s" }}/>
        </div>
      </div>}
      {done&&<div style={{ marginTop:16,background:C.light,border:`1px solid ${C.primary}44`,borderRadius:12,padding:"18px 22px" }}>
        <div style={{ color:C.primary,fontSize:15,fontWeight:700,marginBottom:12 }}>✅ 報告書の生成が完了しました</div>
        <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginBottom:12 }}>
          {["準備書_第4章_生物多様性.docx","準備書_第4章_生物多様性.pdf","種リスト.xlsx"].map(f=>(
            <div key={f} style={{ background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:7,cursor:"pointer",boxShadow:C.shadow }}>
              <span style={{ fontSize:18 }}>📄</span>
              <span style={{ color:C.text,fontSize:12,fontWeight:500 }}>{f}</span>
            </div>
          ))}
        </div>
        <div style={{ color:C.textMuted,fontSize:13 }}>
          ⏱ 生成時間: 2分14秒 · <strong style={{ color:C.primary }}>従来の手動作業（約3週間）を99%削減</strong>
        </div>
      </div>}
    </Card>
  </div>;
}

// ─── COMPLIANCE MODULE ────────────────────────────────────────────────────────
function ComplianceModule() {
  const laws=[
    {name:"環境影響評価法",              y:"1997年",a:"2014年",r:"主要法令",  isNew:false},
    {name:"生物多様性基本法",            y:"2008年",a:"2008年",r:"基本方針",  isNew:false},
    {name:"種の保存法",                  y:"1992年",a:"2018年",r:"保護種指定",isNew:false},
    {name:"自然公園法",                  y:"1957年",a:"2020年",r:"公園区域",  isNew:false},
    {name:"外来生物法",                  y:"2004年",a:"2023年",r:"外来種規制",isNew:false},
    {name:"地域生物多様性増進活動促進法",y:"2025年",a:"新法",   r:"自然共生",  isNew:true},
  ];
  return <div>
    <h1 style={{ color:C.text,fontFamily:"'Noto Serif JP',serif",
      fontSize:28,fontWeight:700,margin:"0 0 6px" }}>法令ライブラリ</h1>
    <p style={{ color:C.textMuted,fontSize:14,marginBottom:28 }}>
      関連法令のリアルタイム監視・改正アラート・プロジェクトへの自動反映
    </p>
    <div style={{ background:C.amberLight,border:`1px solid ${C.amber}44`,
      borderRadius:12,padding:"16px 20px",marginBottom:24 }}>
      <div style={{ color:C.amber,fontWeight:700,fontSize:15,marginBottom:6 }}>⚠️ 法令改正アラート</div>
      <div style={{ color:C.textMid,fontSize:14,lineHeight:1.7 }}>
        <strong>地域生物多様性増進活動促進法</strong>が2025年4月1日に施行されました。
        進行中の複数プロジェクトに影響する可能性があります。各プロジェクトマネージャーに通知済み。
      </div>
    </div>
    <Card style={{ padding:0,overflow:"hidden" }}>
      <table style={{ width:"100%",borderCollapse:"collapse" }}>
        <thead><tr style={{ background:C.bg }}>
          {["法令名","制定年","最終改正","役割","ステータス"].map(h=>(
            <th key={h} style={{ padding:"11px 18px",textAlign:"left",
              color:C.textMuted,fontSize:12,fontFamily:"'DM Mono',monospace",
              borderBottom:`1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{laws.map((l,i)=>(
          <tr key={i} style={{ borderBottom:`1px solid ${C.borderLight}`,
            background:l.isNew?`${C.amberLight}`:C.surface }}>
            <td style={{ padding:"13px 18px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                {l.isNew&&<span>⚠️</span>}
                <span style={{ color:C.text,fontSize:14,fontWeight:600 }}>{l.name}</span>
              </div>
            </td>
            <td style={{ padding:"13px 18px",color:C.textMuted,fontSize:13 }}>{l.y}</td>
            <td style={{ padding:"13px 18px",color:C.textMuted,fontSize:13 }}>{l.a}</td>
            <td style={{ padding:"13px 18px" }}><Chip color={C.blue} bg={C.blueLight}>{l.r}</Chip></td>
            <td style={{ padding:"13px 18px" }}>
              <Chip color={l.isNew?C.amber:C.mid} bg={l.isNew?C.amberLight:C.light}>
                {l.isNew?"新法 2025.4":"最新"}
              </Chip>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  </div>;
}

// ─── SPECIES GLOBAL MODULE ────────────────────────────────────────────────────
function SpeciesModule() {
  return <div>
    <h1 style={{ color:C.text,fontFamily:"'Noto Serif JP',serif",
      fontSize:28,fontWeight:700,margin:"0 0 6px" }}>種・生息地データ</h1>
    <p style={{ color:C.textMuted,fontSize:14,marginBottom:28 }}>
      全プロジェクト横断の確認種データベース · 環境省 + 47都道府県版レッドリスト統合
    </p>
    <div style={{ display:"flex",gap:12,marginBottom:24,flexWrap:"wrap" }}>
      {Object.entries(STATUS_CFG).map(([k,v])=>(
        <div key={k} style={{ background:v.bg,border:`1px solid ${v.c}44`,
          borderRadius:10,padding:"14px 20px",minWidth:120,textAlign:"center" }}>
          <div style={{ color:v.c,fontSize:26,fontWeight:800 }}>0</div>
          <div style={{ color:v.c,fontSize:10,fontFamily:"'DM Mono',monospace",marginTop:4 }}>{k}</div>
          <div style={{ color:v.c,fontSize:11,opacity:0.75,marginTop:2 }}>{v.label}</div>
        </div>
      ))}
    </div>
    <Card style={{ textAlign:"center",padding:52,border:`2px dashed ${C.border}`,boxShadow:"none" }}>
      <div style={{ fontSize:42,marginBottom:14 }}>🌿</div>
      <div style={{ color:C.textMuted,fontSize:15 }}>
        確認種データはプロジェクトの「確認種リスト」タブから入力します。<br/>
        入力されたデータがここに集約されます。
      </div>
    </Card>
  </div>;
}

// ─── MONITORING MODULE ────────────────────────────────────────────────────────
function MonitoringModule() {
  return <div>
    <h1 style={{ color:C.text,fontFamily:"'Noto Serif JP',serif",
      fontSize:28,fontWeight:700,margin:"0 0 6px" }}>📊 事後モニタリング</h1>
    <p style={{ color:C.textMuted,fontSize:14,marginBottom:32 }}>
      工事中・供用後のベースライン比較・定期調査スケジュール管理
    </p>
    <Card style={{ textAlign:"center",padding:60,border:`2px dashed ${C.border}`,boxShadow:"none" }}>
      <div style={{ fontSize:52,marginBottom:16 }}>📊</div>
      <div style={{ color:C.text,fontSize:16,fontWeight:600,marginBottom:8 }}>事後モニタリング</div>
      <div style={{ color:C.textMuted,fontSize:14 }}>フェーズ2でリリース予定</div>
    </Card>
  </div>;
}

// ─── ACCOUNT MODULE ───────────────────────────────────────────────────────────

// ─── PROFILE SETTINGS MODAL ───────────────────────────────────────────────────
function ProfileSettingsModal({ currentUser, onClose, initialTab="profile" }) {
  const [tab, setTab] = useState(initialTab);
  const [name, setName] = useState(currentUser?.name||"");
  const [saved, setSaved] = useState(false);
  const [oldPw, setOldPw] = useState(""); const [newPw, setNewPw] = useState(""); const [pwMsg, setPwMsg] = useState("");

  const saveName = async () => {
    if(isConfigured && currentUser?.id) {
      await supabase.from("profiles").update({ name }).eq("id", currentUser.id);
    }
    setSaved(true); setTimeout(()=>setSaved(false), 3000);
  };

  const changePassword = async () => {
    if(!newPw || newPw.length < 8) { setPwMsg("パスワードは8文字以上必要です"); return; }
    if(isConfigured) {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if(error) { setPwMsg("エラー: "+error.message); return; }
    }
    setPwMsg("✓ パスワードを変更しました"); setOldPw(""); setNewPw("");
  };

  return <div style={{ position:"fixed", inset:0, background:"#00000066",
    display:"flex", alignItems:"center", justifyContent:"center", zIndex:500 }}>
    <div style={{ background:C.surface, borderRadius:16, width:480,
      boxShadow:C.shadowMd, overflow:"hidden" }}>
      <div style={{ padding:"22px 28px", borderBottom:`1px solid ${C.borderLight}`,
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ color:C.text, fontSize:18, fontWeight:700,
          fontFamily:"'Noto Serif JP',serif" }}>アカウント設定</h2>
        <Btn variant="ghost" size="sm" onClick={onClose}>✕</Btn>
      </div>
      <div style={{ display:"flex", borderBottom:`1px solid ${C.borderLight}` }}>
        {[["profile","👤 プロフィール"],["password","🔒 パスワード"]].map(([k,v])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"12px 22px",
            background:"none", border:"none", borderBottom:`3px solid ${tab===k?C.primary:"transparent"}`,
            marginBottom:-2, color:tab===k?C.primary:C.textMuted, cursor:"pointer",
            fontSize:13, fontWeight:tab===k?700:400, fontFamily:"'Noto Sans JP',sans-serif" }}>{v}</button>
        ))}
      </div>
      <div style={{ padding:28 }}>
        {tab==="profile" && <>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
            <div style={{ width:64, height:64, borderRadius:"50%",
              background:`linear-gradient(135deg,${C.primary},${C.blue})`,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:C.white, fontWeight:700, fontSize:26 }}>{(name||"?")[0]}</div>
            <div>
              <div style={{ color:C.text, fontSize:16, fontWeight:700 }}>{currentUser?.email}</div>
              <Chip color={ROLE_CFG[currentUser?.role||"pm"].color}
                bg={ROLE_CFG[currentUser?.role||"pm"].badge} size={11}>
                {ROLE_CFG[currentUser?.role||"pm"].label}
              </Chip>
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:8 }}>表示名</label>
            <input value={name} onChange={e=>setName(e.target.value)}
              style={{ ...INP, fontSize:14 }} />
          </div>
          {saved && <div style={{ color:C.mid, fontSize:13, marginBottom:12, fontWeight:700 }}>✓ 保存しました</div>}
          <Btn onClick={saveName} fullWidth>変更を保存</Btn>
        </>}
        {tab==="password" && <>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:8 }}>新しいパスワード</label>
            <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)}
              placeholder="8文字以上" style={{ ...INP, fontSize:14 }} />
          </div>
          {pwMsg && <div style={{ fontSize:13, marginBottom:12,
            color:pwMsg.startsWith("✓")?C.mid:C.red, fontWeight:600 }}>{pwMsg}</div>}
          <Btn onClick={changePassword} fullWidth>パスワードを変更する</Btn>
          <p style={{ color:C.textFaint, fontSize:12, marginTop:12, textAlign:"center" }}>
            ※Supabase経由でパスワードリセットメールも送信できます
          </p>
        </>}
      </div>
    </div>
  </div>;
}

function AccountModule({ org, currentUser }) {
  const [tab,setTab]=useState("team");
  const [inviting,setInviting]=useState(false);
  const isAdmin = ["admin","pm"].includes(currentUser?.role);
  const plan = PLANS[org?.plan||"starter"];
  const memberCount = TEAM.length;
  const atUserLimit = memberCount >= plan.maxUsers;
  const TABS = {
    team: "チームメンバー",
    roles: "権限・役割",
    billing: "請求情報",
    ...(isAdmin ? { admin: "🔐 管理者設定" } : {})
  };
  return <div>
    <h1 style={{ color:C.text,fontFamily:"'Noto Serif JP',serif",
      fontSize:28,fontWeight:700,margin:"0 0 6px" }}>アカウント管理</h1>
    <p style={{ color:C.textMuted,fontSize:14,marginBottom:28 }}>
      組織設定・チームメンバー・利用プラン・権限管理
    </p>
    <Card style={{ marginBottom:24,padding:"22px 26px" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ display:"flex",alignItems:"center",gap:16 }}>
          <div style={{ width:56,height:56,borderRadius:14,
            background:`linear-gradient(135deg,${C.primary},${C.mid})`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:26,color:C.white,fontWeight:700 }}>{org.name[0]}</div>
          <div>
            <div style={{ color:C.text,fontSize:18,fontWeight:700,
              fontFamily:"'Noto Serif JP',serif" }}>{org.name}</div>
            <div style={{ color:C.textMuted,fontSize:14,marginTop:4 }}>
              {org.users}名 · {org.projects}件
            </div>
            <div style={{ marginTop:8,display:"flex",gap:8 }}>
              <Chip color={C.primary} bg={C.light}>{PLANS[org.plan].label}プラン</Chip>
              <Chip color={C.mid} bg={C.light}>{PLANS[org.plan].price}</Chip>
            </div>
          </div>
        </div>
        <Btn variant="secondary">プラン変更</Btn>
      </div>
    </Card>
    <Card style={{ marginBottom:24,padding:"16px 20px",background:C.amberLight,
      border:`1px solid ${C.amber}44`,boxShadow:"none" }}>
      <div style={{ color:C.amber,fontWeight:700,fontSize:14,marginBottom:6 }}>
        🔐 組織間データ分離
      </div>
      <div style={{ color:C.textMid,fontSize:13,lineHeight:1.7 }}>
        各組織のデータは完全に独立したテナントで管理。AWS東京リージョン（ap-northeast-1）にて日本国内保管、個人情報保護法（APPI）完全準拠。
      </div>
    </Card>
    <div style={{ display:"flex",borderBottom:`2px solid ${C.borderLight}`,marginBottom:20 }}>
      {Object.entries(TABS).map(([k,v])=>(
        <button key={k} onClick={()=>setTab(k)} style={{ padding:"10px 22px",
          background:"none",border:"none",
          borderBottom:`3px solid ${tab===k?C.primary:"transparent"}`,marginBottom:-2,
          color:tab===k?C.primary:C.textMuted,cursor:"pointer",fontSize:14,
          fontWeight:tab===k?700:400,fontFamily:"'Noto Sans JP',sans-serif" }}>{v}</button>
      ))}
    </div>
    {tab==="team"&&<div>
      <div style={{ display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:16 }}>
        <div>
          <SLabel>チームメンバー ({memberCount}名)</SLabel>
          <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:160, height:6, background:C.bg, borderRadius:3 }}>
              <div style={{ height:"100%", borderRadius:3,
                width:`${Math.min(100,(memberCount/plan.maxUsers)*100)}%`,
                background: atUserLimit ? C.red : C.primary, transition:"width 0.3s" }}/>
            </div>
            <span style={{ fontSize:12, color:atUserLimit?C.red:C.textMuted }}>
              {memberCount} / {plan.maxUsers===999?"無制限":plan.maxUsers}名
              {atUserLimit && " — 上限に達しています"}
            </span>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          {atUserLimit && <div style={{ fontSize:12, color:C.amber, fontWeight:600,
            background:C.amberLight, padding:"4px 10px", borderRadius:6 }}>
            プランをアップグレードするとメンバーを追加できます
          </div>}
          <Btn onClick={()=>!atUserLimit&&setInviting(!inviting)}
            icon="➕" size="sm"
            disabled={atUserLimit}
            style={{ opacity:atUserLimit?0.5:1 }}>メンバーを招待</Btn>
        </div>
      </div>
      {inviting&&<Card style={{ marginBottom:16,padding:"18px 20px",
        background:C.light,border:`1px solid ${C.primary}44`,boxShadow:"none" }}>
        <SLabel>新規メンバーを招待する</SLabel>
        <div style={{ display:"flex",gap:12,alignItems:"flex-end" }}>
          <div style={{ flex:2 }}>
            <label style={{ display:"block",color:C.textMid,fontSize:14,fontWeight:700,marginBottom:6 }}>メールアドレス</label>
            <input placeholder="example@company.jp" style={{ ...INP,fontSize:14 }}/>
          </div>
          <div style={{ flex:1 }}>
            <label style={{ display:"block",color:C.textMid,fontSize:14,fontWeight:700,marginBottom:6 }}>役割</label>
            <select style={{ ...INP,fontSize:14 }}>
              {Object.entries(ROLE_CFG).map(([k,v])=><option key={k}>{v.label}</option>)}
            </select>
          </div>
          <Btn onClick={()=>setInviting(false)}>招待メールを送信</Btn>
          <Btn onClick={()=>setInviting(false)} variant="ghost">取消</Btn>
        </div>
      </Card>}
      <Card style={{ padding:0,overflow:"hidden" }}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead><tr style={{ background:C.bg }}>
            {["氏名","メールアドレス","役割","参加日","状態","操作"].map(h=>(
              <th key={h} style={{ padding:"10px 18px",textAlign:"left",
                color:C.textMuted,fontSize:12,fontFamily:"'DM Mono',monospace",
                borderBottom:`1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {TEAM.map(m=>{const r=ROLE_CFG[m.role];return <tr key={m.id}
              style={{ borderBottom:`1px solid ${C.borderLight}` }}>
              <td style={{ padding:"12px 18px" }}>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ width:34,height:34,borderRadius:"50%",
                    background:`linear-gradient(135deg,${C.primary},${C.blue})`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    color:C.white,fontWeight:700,fontSize:14,flexShrink:0 }}>{m.name[0]}</div>
                  <span style={{ color:C.text,fontSize:14,fontWeight:600 }}>{m.name}</span>
                </div>
              </td>
              <td style={{ padding:"12px 18px",color:C.textMuted,fontSize:13 }}>{m.email}</td>
              <td style={{ padding:"12px 18px" }}><Chip color={r.color} bg={r.badge}>{r.label}</Chip></td>
              <td style={{ padding:"12px 18px",color:C.textMuted,fontSize:13,fontFamily:"'DM Mono',monospace" }}>{m.joined}</td>
              <td style={{ padding:"12px 18px" }}>
                <Chip color={m.active?C.mid:C.textMuted} bg={m.active?C.light:C.bg}>
                  {m.active?"アクティブ":"招待済"}
                </Chip>
              </td>
              <td style={{ padding:"12px 18px" }}>
                <div style={{ display:"flex",gap:6 }}>
                  <Btn variant="ghost" size="sm">編集</Btn>
                  <Btn variant="danger" size="sm">削除</Btn>
                </div>
              </td>
            </tr>;})}
          </tbody>
        </table>
      </Card>
    </div>}
    {tab==="roles"&&<div style={{ display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14 }}>
      {Object.entries(ROLE_CFG).map(([key,role])=>{
        const p={
          admin:   ["全モジュール管理","チーム管理・招待","請求管理","全プロジェクト閲覧・編集","報告書承認"],
          pm:      ["全モジュールアクセス","プロジェクト作成・編集","報告書生成・承認","チームアサイン"],
          surveyor:["モバイルアプリ使用","種データ入力","写真・GPS記録","報告書閲覧のみ"],
          author:  ["全データ閲覧","報告書生成・編集","種リスト編集","請求・管理機能なし"],
          client:  ["プロジェクト進捗閲覧","最終報告書閲覧","データ入力不可"],
          reviewer:["文書レビュー","コメント追加","承認署名","データ入力不可"],
        }[key];
        return <Card key={key}>
          <div style={{ marginBottom:12 }}><Chip color={role.color} bg={role.badge} size={13}>{role.label}</Chip></div>
          {p.map(item=><div key={item} style={{ display:"flex",alignItems:"center",
            gap:8,color:C.textMid,fontSize:14,marginBottom:8 }}>
            <span style={{ color:C.mid,fontWeight:700,fontSize:15 }}>✓</span>{item}
          </div>)}
        </Card>;
      })}
    </div>}
    {tab==="billing"&&<div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
      <Card>
        <SLabel>プラン選択</SLabel>
        {Object.entries(PLANS).map(([k,p])=>(
          <div key={k} style={{ padding:"16px",borderRadius:12,marginBottom:10,
            border:`2px solid ${org.plan===k?C.primary:C.borderLight}`,
            background:org.plan===k?C.light:C.surface,cursor:"pointer" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div>
                <div style={{ color:C.text,fontSize:15,fontWeight:700 }}>{p.label}</div>
                <div style={{ color:C.textMuted,fontSize:13,marginTop:2 }}>{p.price}</div>
              </div>
              {org.plan===k&&<Chip color={C.primary} bg={C.light}>現在</Chip>}
            </div>
          </div>
        ))}
      </Card>
      <Card>
        <SLabel>請求履歴</SLabel>
        {[{d:"2026-03-01",a:"¥480,000"},{d:"2025-03-01",a:"¥480,000"},{d:"2024-03-01",a:"¥480,000"}].map((inv,i)=>(
          <div key={i} style={{ display:"flex",justifyContent:"space-between",
            alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${C.borderLight}` }}>
            <div>
              <div style={{ color:C.text,fontSize:14,fontWeight:600 }}>{inv.d}</div>
              <div style={{ color:C.textMuted,fontSize:13 }}>{inv.a}</div>
            </div>
            <div style={{ display:"flex",gap:8,alignItems:"center" }}>
              <Chip color={C.mid} bg={C.light}>支払済</Chip>
              <Btn variant="ghost" size="sm">PDF</Btn>
            </div>
          </div>
        ))}
      </Card>
    </div>}
    {tab==="admin" && isAdmin && <div>
      <Card style={{ marginBottom:20, padding:"22px 26px",
        border:`2px solid ${C.primary}33`, background:C.light }}>
        <div style={{ color:C.primary, fontWeight:700, fontSize:16,
          fontFamily:"'Noto Serif JP',serif", marginBottom:8 }}>🔐 管理者ダッシュボード</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
          {[
            { l:"総メンバー数", v:memberCount, u:"名", c:C.primary },
            { l:"プロジェクト上限", v:plan.maxProjects===999?"無制限":plan.maxProjects, u:"", c:C.mid },
            { l:"ユーザー上限", v:plan.maxUsers===999?"無制限":plan.maxUsers, u:"名", c:C.blue },
          ].map(s=><div key={s.l} style={{ background:C.surface, borderRadius:10,
            padding:"14px 16px", border:`1px solid ${C.borderLight}` }}>
            <div style={{ color:C.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace",
              marginBottom:6 }}>{s.l}</div>
            <div style={{ color:s.c, fontSize:24, fontWeight:800 }}>
              {s.v}<span style={{ fontSize:13, opacity:0.7, marginLeft:3 }}>{s.u}</span>
            </div>
          </div>)}
        </div>
      </Card>
      <Card style={{ marginBottom:20 }}>
        <SLabel>メンバー権限管理</SLabel>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ background:C.bg }}>
            {["氏名","メールアドレス","現在の役割","操作"].map(h=>(
              <th key={h} style={{ padding:"10px 18px", textAlign:"left",
                color:C.textMuted, fontSize:12, fontFamily:"'DM Mono',monospace",
                borderBottom:`1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {TEAM.map(m=>{
              const r=ROLE_CFG[m.role];
              const isSelf = m.email === currentUser?.email;
              return <tr key={m.id} style={{ borderBottom:`1px solid ${C.borderLight}`,
                background:isSelf?C.light:"transparent" }}>
                <td style={{ padding:"12px 18px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%",
                      background:`linear-gradient(135deg,${C.primary},${C.blue})`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      color:C.white, fontWeight:700, fontSize:13 }}>{m.name[0]}</div>
                    <div>
                      <div style={{ color:C.text, fontSize:14, fontWeight:600 }}>{m.name}</div>
                      {isSelf && <span style={{ fontSize:11, color:C.mid }}>あなた</span>}
                    </div>
                  </div>
                </td>
                <td style={{ padding:"12px 18px", color:C.textMuted, fontSize:13 }}>{m.email}</td>
                <td style={{ padding:"12px 18px" }}><Chip color={r.color} bg={r.badge}>{r.label}</Chip></td>
                <td style={{ padding:"12px 18px" }}>
                  {!isSelf && <div style={{ display:"flex", gap:6 }}>
                    <select defaultValue={m.role} style={{ ...INP, fontSize:12, padding:"5px 10px" }}>
                      {Object.entries(ROLE_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <Btn variant="danger" size="sm">削除</Btn>
                  </div>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </Card>
      <Card>
        <SLabel>組織設定</SLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <div>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:8 }}>組織名</label>
            <input defaultValue={org?.name} style={{ ...INP, fontSize:14 }} />
          </div>
          <div>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:8 }}>プラン</label>
            <input value={plan.label} readOnly
              style={{ ...INP, fontSize:14, background:C.bg, color:C.textMuted }} />
          </div>
        </div>
        <div style={{ marginTop:14 }}>
          <Btn>組織設定を保存</Btn>
        </div>
      </Card>
    </div>}
  </div>;
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [loggedIn,setLoggedIn]=useState(false);
  const [org,setOrg]=useState(null);
  const [currentUser,setCurrentUser]=useState(null); // { id, name, email, role }
  const [active,setActive]=useState("dashboard");
  const [selectedProject,setSelectedProject]=useState(null);
  const [projects,setProjects]=useState(INIT_PROJECTS);
  const [showNew,setShowNew]=useState(false);
  const [showProfile,setShowProfile]=useState(false);

  // ── Supabase session persistence ──────────────────────
  useEffect(()=>{
    if(!isConfigured) return;
    supabase.auth.getSession().then(async ({ data:{ session } })=>{
      if(session){
        const { data:profile } = await supabase
          .from("profiles").select("*, organizations(*)")
          .eq("id", session.user.id).single();
        setOrg(profile?.organizations ?? { name:session.user.email, plan:"starter" });
        setCurrentUser({ id:session.user.id, name:profile?.name||session.user.email,
          email:session.user.email, role:profile?.role||"pm" });
        setLoggedIn(true);
      }
    });
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event)=>{
      if(event==="SIGNED_OUT"){ setLoggedIn(false); setOrg(null); setCurrentUser(null); }
    });
    return ()=> subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    const s=document.createElement("style");
    s.textContent=`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700;800&family=Noto+Sans+JP:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      body{background:${C.bg};font-family:'Noto Sans JP',sans-serif;-webkit-font-smoothing:antialiased;}
      ::-webkit-scrollbar{width:6px;height:6px;}
      ::-webkit-scrollbar-track{background:${C.bg};}
      ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
      select option{background:${C.surface};color:${C.text};}
    `;
    document.head.appendChild(s);
  },[]);

  if(!loggedIn) return <LoginScreen onLogin={({org:o,user:u})=>{
    setOrg(o);
    setCurrentUser(u);
    setLoggedIn(true);
  }}/>;

  const nav=v=>{setActive(v);if(v!=="project")setSelectedProject(null);};
  const updateProject=u=>{setProjects(p=>p.map(x=>x.id===u.id?u:x));setSelectedProject(u);};

  const handleLogout = async () => {
    if(isConfigured) await supabase.auth.signOut();
    setLoggedIn(false); setOrg(null); setCurrentUser(null);
  };

  const handleDeleteProject = (id) => {
    setProjects(p => p.filter(x => x.id !== id));
    if(selectedProject?.id === id) { setSelectedProject(null); setActive("dashboard"); }
  };

  const [profileTab, setProfileTab] = useState("profile");
  const openProfile = (tab="profile") => { setProfileTab(tab); setShowProfile(true); };

  const renderMain=()=>{
    if(active==="project"&&selectedProject)
      return <ProjectDetail project={selectedProject} setActive={setActive} onUpdate={updateProject}/>;
    switch(active){
      case "dashboard":  return <Dashboard projects={projects} setSelectedProject={setSelectedProject}
        setActive={setActive} onNew={()=>setShowNew(true)}
        onDelete={handleDeleteProject} currentUser={currentUser}/>;
      case "scoping":    return <ScopingModule/>;
      case "species":    return <SpeciesModule/>;
      case "reports":    return <ReportModule/>;
      case "compliance": return <ComplianceModule/>;
      case "monitoring": return <MonitoringModule/>;
      case "account":    return <AccountModule org={org} currentUser={currentUser}/>;
      default: return null;
    }
  };

  return <div style={{ background:C.bg, minHeight:"100vh" }}>
    <Header org={org} currentUser={currentUser} onLogout={handleLogout}
      onOpenProfile={openProfile} setActive={nav}/>
    <div style={{ display:"flex" }}>
      <Sidebar active={active} setActive={nav}/>
      <main style={{ flex:1, padding:"32px 36px",
        minHeight:"calc(100vh - 64px)", maxWidth:1300, overflowX:"hidden" }}>
        {renderMain()}
      </main>
    </div>
    {showNew&&<NewProjectModal
      onSave={np=>{setProjects(p=>[...p,np]);setShowNew(false);}}
      onCancel={()=>setShowNew(false)}/>}
    {showProfile&&<ProfileSettingsModal currentUser={currentUser}
      initialTab={profileTab} onClose={()=>setShowProfile(false)}/>}
  </div>;
}

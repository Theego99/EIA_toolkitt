import React, { useState, useEffect } from "react";
import { supabase, isConfigured } from "./lib/supabase.js";
import * as EIA from "./lib/eiaLaw.js";
import { lookupSpecies, suggestSpecies, RED_LIST_NAMES } from "./lib/redList.js";

// ── OFFLINE STORE (IndexedDB) ─────────────────────────────────────────────────
const DB_NAME = "eia-toolkit", DB_VERSION = 3;
let _db = null;
async function openDB() {
  if (_db) return _db;
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath:"id" });
      if (!db.objectStoreNames.contains("syncQueue")) {
        const sq = db.createObjectStore("syncQueue", { keyPath:"qid", autoIncrement:true });
        sq.createIndex("by_table","table");
      }
      if (!db.objectStoreNames.contains("templates")) db.createObjectStore("templates", { keyPath:"id" });
      // v3: offline upload queue — stores the actual file Blob so field
      // uploads survive offline and are pushed to Storage when back online.
      if (!db.objectStoreNames.contains("uploads")) db.createObjectStore("uploads", { keyPath:"id" });
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror = () => rej(req.error);
  });
}
async function idbTx(store, mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store), r = fn(s);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGetAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(store,"readonly").objectStore(store).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function saveProjectLocal(p)      { await idbTx("projects","readwrite", s=>s.put({...p,_updatedAt:Date.now()})); }
async function getAllProjectsLocal()     { return idbGetAll("projects"); }
async function deleteProjectLocal(id)   { await idbTx("projects","readwrite", s=>s.delete(id)); }
async function saveTemplate(t)          { await idbTx("templates","readwrite", s=>s.put({...t,_updatedAt:Date.now()})); }
async function getAllTemplates()         { return idbGetAll("templates"); }
async function deleteTemplate(id)       { await idbTx("templates","readwrite", s=>s.delete(id)); }
async function enqueue(table, op, payload) {
  const db = await openDB();
  return new Promise((res,rej) => {
    const r = db.transaction("syncQueue","readwrite").objectStore("syncQueue")
      .add({ table, op, payload, timestamp:Date.now(), retries:0 });
    r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error);
  });
}
async function getSyncQueueLength() {
  const db = await openDB();
  return new Promise((res,rej) => {
    const r = db.transaction("syncQueue","readonly").objectStore("syncQueue").count();
    r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error);
  });
}
async function removeFromQueue(qid) { await idbTx("syncQueue","readwrite", s=>s.delete(qid)); }
async function bumpRetry(entry, retries) {
  await idbTx("syncQueue","readwrite", s=>s.put({ ...entry, retries: retries ?? (entry.retries||0)+1 }));
}
const MAX_SYNC_RETRIES = 8;
async function flushSyncQueue(sb) {
  if (!sb || !navigator.onLine) return { synced:0, failed:0, error:null };
  const queue = await idbGetAll("syncQueue");
  let synced=0, failed=0, lastError=null;
  for (const entry of queue) {
    const pid = String(entry.payload?.id ?? "");
    // Purge demo/legacy junk: numeric or timestamp IDs never belong in a real DB
    if (entry.table==="projects" && entry.op==="upsert" && /^\d+$/.test(pid)) {
      await removeFromQueue(entry.qid); continue;
    }
    try {
      if (entry.table==="projects") {
        if (entry.op==="upsert") {
          if(!entry.payload?.organization_id) {
            // Can't satisfy RLS without an org — give up after a few tries
            if((entry.retries||0) >= MAX_SYNC_RETRIES){ await removeFromQueue(entry.qid); }
            else { await bumpRetry(entry); lastError="organization_id 未設定"; failed++; }
            continue;
          }
          const payload = sanitizeProjectPayload(entry.payload);
          const {error}=await upsertProjectResilient(sb, payload);
          if(error) throw new Error(`${error.code}: ${error.message}`);
        } else if (entry.op==="delete") {
          const {error}=await sb.from("projects").delete().eq("id",pid);
          if(error) throw new Error(`${error.code}: ${error.message}`);
        }
      }
      await removeFromQueue(entry.qid); synced++;
    } catch(e) {
      lastError = e.message;
      console.error("[Sync] FAILED entry", entry.qid, e.message);
      // Stop poisoning the queue: drop after too many failed attempts so the
      // banner clears and new edits can sync (the local copy is still saved).
      const retries = (entry.retries||0)+1;
      if(retries >= MAX_SYNC_RETRIES) await removeFromQueue(entry.qid);
      else await bumpRetry(entry, retries);
      failed++;
    }
  }
  return { synced, failed, error:lastError };
}

// ── Offline upload queue (files / field photos) ─────────────────────────────
async function saveUpload(rec) { await idbTx("uploads","readwrite", s=>s.put(rec)); }
async function getUploads() { return idbGetAll("uploads"); }
async function deleteUpload(id) { await idbTx("uploads","readwrite", s=>s.delete(id)); }

// Push pending field uploads to Supabase Storage. onLinked(projectId, uploadId,
// url, kind) writes the resulting public URL back onto the doc/photo record.
async function flushUploads(sb, onLinked) {
  if (!sb || !navigator.onLine) return { done:0, failed:0 };
  const pending = await getUploads();
  let done=0, failed=0;
  for (const u of pending) {
    try {
      const { error } = await sb.storage.from("project-docs").upload(u.path, u.blob, { upsert:true });
      if (error) throw error;
      const { data } = sb.storage.from("project-docs").getPublicUrl(u.path);
      if (onLinked) await onLinked(u.projectId, u.id, data?.publicUrl || null, u.kind);
      await deleteUpload(u.id);
      done++;
    } catch(e) { console.warn("[Upload] pending failed", u.id, e.message); failed++; }
  }
  return { done, failed };
}

// Strip any keys not in the DB schema, ensure id is a valid UUID string
function sanitizeProjectPayload(p) {
  // If id looks like a timestamp number, generate a UUID (shouldn't happen with new code)
  const id = typeof p.id === "number" ? crypto.randomUUID() : String(p.id);
  return {
    id,
    organization_id: p.organization_id,
    name:           p.name            || "",
    client:         p.client          || "",
    type:           p.type            || "wind",
    stage:          Number(p.stage)   || 1,
    pref:           p.pref            || "東京都",
    deadline:       p.deadline        || null,
    area:           p.area            || null,
    budget:         p.budget          || null,
    description:    p.description     || p.desc || null,
    manager:        p.manager         || null,
    risk:           p.risk            || "low",
    progress:       Number(p.progress)||0,
    red_list_count: Number(p.red_list_count||p.redListCount)||0,
    tasks:          p.tasks           || {},
    custom_stages:  p.custom_stages   || p.customStages   || null,
    species_data:   p.species_data    || p.species        || [],
    documents:      p.documents       || [],
    comments:       p.comments        || [],
    project_class:  p.project_class   || p.projectClass   || "1",
    juran_dates:    p.juran_dates     || p.juranDates     || {},
    activity:       p.activity        || [],
  };
}

// Upsert that degrades gracefully if the optional `activity` column hasn't
// been added to the DB yet — so the audit trail never breaks project sync.
async function upsertProjectResilient(sb, payload) {
  let res = await sb.from("projects").upsert(payload);
  if (res.error && (res.error.code === "PGRST204" || /activity/i.test(res.error.message || ""))) {
    const { activity, ...rest } = payload;
    res = await sb.from("projects").upsert(rest);
  }
  return res;
}

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

// ── 法定EIA手続きフロー（環境影響評価法・施行令準拠）──────────────────────────
// 6段階：配慮書（任意）→ 方法書 → 現地調査 → 準備書 → 評価書 → 事後調査報告書
// 意見聴取は方法書・準備書に内包（独立段階ではない）
const STAGES = [
  { id:1, short:"配慮書",   label:"配慮書手続",         color:"#059669", desc:"計画段階からの早期環境配慮（任意手続）",                                statutory:true,  juran:false },
  { id:2, short:"方法書",   label:"方法書手続",         color:"#2563EB", desc:"調査手法・地点・項目の確定／公告縦覧30日／住民意見・知事意見",         statutory:true,  juran:true  },
  { id:3, short:"現地調査", label:"現地調査",           color:"#D97706", desc:"実際の現地調査・データ取得（法令上の段階ではなく業務実施フェーズ）",   statutory:false, juran:false },
  { id:4, short:"準備書",   label:"準備書手続",         color:"#7C3AED", desc:"準備書作成・公告縦覧30日／住民意見・知事意見（4ヶ月）・大臣意見",     statutory:true,  juran:true  },
  { id:5, short:"評価書",   label:"評価書手続",         color:"#DC2626", desc:"準備書補正→評価書作成・主務大臣確認・公告縦覧",                        statutory:true,  juran:true  },
  { id:6, short:"事後調査", label:"事後調査・報告書",   color:"#0891B2", desc:"工事中・供用後モニタリング・報告書（法第38条の2）",                    statutory:true,  juran:false },
];

// 第一種/第二種事業の規模区分（環境影響評価法施行令）
const PROJECT_CLASS_THRESHOLDS = {
  wind:     { class1:"「出力50,000kW以上」または「海域内」",   class2:"出力22,500kW以上50,000kW未満" },
  solar:    { class1:"出力250,000kW以上",                        class2:"出力100,000kW以上250,000kW未満" },
  road:     { class1:"4車線以上・延長10km以上",                  class2:"4車線以上・延長7.5km以上" },
  rail:     { class1:"新幹線または延長20km以上",                  class2:"延長15km以上" },
  airport:  { class1:"滑走路長2,500m以上",                        class2:"滑走路長1,875m以上" },
  dam:      { class1:"貯水量6,000万m³以上 または ダム高さ100m以上", class2:"貯水量4,500万m³以上" },
  thermal:  { class1:"出力150,000kW以上",                        class2:"出力112,500kW以上" },
  hydro:    { class1:"出力30,000kW以上",                          class2:"出力22,500kW以上" },
  geo:      { class1:"出力10,000kW以上",                          class2:"出力7,500kW以上" },
  port:     { class1:"港湾計画（国際拠点・重要港湾）",            class2:"地方港湾" },
  reclaim:  { class1:"面積50ha以上",                              class2:"面積37.5ha以上" },
  waste:    { class1:"日処理量300t以上",                          class2:"日処理量225t以上" },
  housing:  { class1:"面積100ha以上",                             class2:"面積75ha以上" },
  industry: { class1:"面積100ha以上",                             class2:"面積75ha以上" },
  other:    { class1:"事業規模による（要個別確認）",              class2:"事業規模による（要個別確認）" },
};

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

// 環境影響評価法施行令 別表 – 対象事業種
const TYPE_ICONS = {
  wind:"💨", solar:"☀️", thermal:"🔥", hydro:"💧", geo:"🌋", nuclear:"⚛️",
  road:"🛣️", rail:"🚄", airport:"✈️",
  dam:"🌊", river:"🏞️",
  port:"⚓", reclaim:"🏗️",
  waste:"♻️", housing:"🏘️", industry:"🏭", landadj:"📐",
  other:"📋"
};

// 全事業種別（施行令準拠）
const ALL_PROJECT_TYPES = [
  // 発電所
  { v:"wind",    g:"発電所", l:"💨 風力発電所" },
  { v:"solar",   g:"発電所", l:"☀️ 太陽光発電所" },
  { v:"thermal", g:"発電所", l:"🔥 火力発電所" },
  { v:"hydro",   g:"発電所", l:"💧 水力発電所" },
  { v:"geo",     g:"発電所", l:"🌋 地熱発電所" },
  { v:"nuclear", g:"発電所", l:"⚛️ 原子力発電所" },
  // インフラ
  { v:"road",    g:"インフラ", l:"🛣️ 道路" },
  { v:"rail",    g:"インフラ", l:"🚄 鉄道" },
  { v:"airport", g:"インフラ", l:"✈️ 飛行場" },
  { v:"dam",     g:"インフラ", l:"🌊 ダム・堰" },
  { v:"river",   g:"インフラ", l:"🏞️ 河川工作物" },
  { v:"port",    g:"インフラ", l:"⚓ 港湾計画" },
  // 土地開発
  { v:"reclaim", g:"土地開発", l:"🏗️ 埋立・干拓" },
  { v:"housing", g:"土地開発", l:"🏘️ 新住宅市街地開発" },
  { v:"industry",g:"土地開発", l:"🏭 工業団地造成" },
  { v:"landadj", g:"土地開発", l:"📐 土地区画整理" },
  // 廃棄物処理
  { v:"waste",   g:"廃棄物", l:"♻️ ごみ処理施設" },
  // その他
  { v:"other",   g:"その他", l:"📋 その他（個別判断）" },
];
const RISK_CFG = {
  high:  { label:"高リスク", c:C.red,   bg:C.redLight },
  medium:{ label:"中リスク", c:C.amber, bg:C.amberLight },
  low:   { label:"低リスク", c:C.mid,   bg:C.light },
};

const BLANK_SPECIES = { name:"", latin:"", type:"植物", status:"LC", protected:false, count:1, location:"", date:"", notes:"", photos:[] };

// 事業種 → 推奨調査テンプレート（技術指針の重点項目に基づく）
const TYPE_TO_TEMPLATE = {
  wind:"bio", solar:"eco", thermal:"air", hydro:"river", geo:"air", nuclear:"eco",
  road:"noise", rail:"noise", airport:"noise",
  dam:"river", river:"river", port:"river", reclaim:"river",
  housing:"eco", industry:"soil", landadj:"eco", waste:"air", other:"bio",
};

// 現場写真の軽量プレビュー（オフラインでも表示できるようdataURLで案件JSONに保持）
function makePreview(file, max=320, q=0.65) {
  return new Promise((res, rej) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width*scale));
        c.height = Math.max(1, Math.round(img.height*scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        res(c.toDataURL("image/jpeg", q));
      } catch(e) { URL.revokeObjectURL(u); rej(e); }
    };
    img.onerror = (e) => { URL.revokeObjectURL(u); rej(e); };
    img.src = u;
  });
}


// ── BUILT-IN SURVEY TYPE TEMPLATES ────────────────────────────────────────────
// These are the default task sets for different 環境調査 types.
// Users can customize and save their own templates on top of these.
const SURVEY_TYPES = [
  { id:"bio",    label:"生物調査",       icon:"🌿", color:"#1B4332" },
  { id:"noise",  label:"騒音・振動調査", icon:"🔊", color:"#7C3AED" },
  { id:"asb",    label:"アスベスト調査", icon:"⚠️", color:"#DC2626" },
  { id:"river",  label:"河川調査",       icon:"🌊", color:"#0369A1" },
  { id:"soil",   label:"土壌汚染調査",   icon:"🏔️", color:"#92400E" },
  { id:"air",    label:"大気質調査",     icon:"💨", color:"#0891B2" },
  { id:"eco",    label:"生態系調査",     icon:"🦋", color:"#059669" },
  { id:"custom", label:"カスタム",       icon:"⚙️", color:"#6B7280" },
];

// ── 法定EIAタスクテンプレート（環境影響評価法・基本的事項準拠）──────────────────
// 段階1=配慮書 / 2=方法書 / 3=現地調査 / 4=準備書 / 5=評価書 / 6=事後調査
const TEMPLATE_TASKS = {
  // ── 生物調査（基本的事項・生物多様性準拠）────────────────────────────────
  bio: {
    1: ["事業の目的・内容・規模の整理","対象地域の地形・土地利用・植生の把握（GIS・空中写真）","既存文献・レッドリスト・自然環境保全基礎調査の収集","生息地感度スクリーニング（デスクトップ調査）","配慮書（生物多様性章）の作成","主務大臣への配慮書提出（環境影響評価法第3条の7）","都道府県知事への送付"],
    2: ["調査対象種群の選定（基本的事項 別表1〜6準拠）","調査手法・季節区分・調査地点の設計","方法書の作成（法第5条）","方法書の公告・縦覧（30日間）（法第6条）","説明会の開催（法第7条）","住民意見書の受付・整理","都道府県知事意見の受理（法第9条）","方法書の最終確定・主務大臣提出（法第10条）"],
    3: ["春季調査の実施（植物・鳥類繁殖期：3〜6月）","夏季調査の実施（昆虫・両生類・爬虫類：7〜8月）","秋季調査の実施（哺乳類・植物結実期：9〜11月）","冬季調査の実施（越冬鳥類・魚類・植物：12〜2月）","猛禽類の繁殖調査（年間を通じた定点観察）","水生生物調査（魚類・底生生物・付着藻類）","植生図の作成（1/2500以上）","全確認種のデータ整理・同定確認・写真整理"],
    4: ["確認種データの集計・多様性指数の算出","環境省・都道府県レッドリスト照合・保護種フラグ付け","特定第二種国内希少野生動植物の確認","植物：改変面積・個体数・代替植生の影響予測","動物：行動圏・移動経路・繁殖期への影響予測","生態系：キーストーン種・食物連鎖への影響評価","環境影響マトリクスの作成","保全措置の検討（回避→低減→代償の序列）","環境保全目標との整合確認","準備書（生物多様性章）の作成（法第14条）","準備書の公告・縦覧（30日間）（法第16条）","説明会の開催（法第17条）","住民意見書の受付・整理","都道府県知事意見の受理（4ヶ月以内）（法第19条）","環境大臣意見の受理（必要に応じ）（法第20条）","事業者の見解書の作成・送付（法第21条）"],
    5: ["準備書の補正・評価書の作成（法第22条）","評価書の主務大臣確認（法第23条）","評価書の公告・縦覧（30日間）（法第26条）","縦覧対応・問い合わせへの対応","許認可申請への評価書添付","許認可機関への評価書送付"],
    6: ["工事中モニタリング計画の策定（法第38条の2）","重要種のモニタリング調査（工事中・年1〜2回）","植生回復・緑化の状況確認","供用後モニタリング調査（供用後3〜5年間・年1回）","モニタリング結果の報告書作成","主務大臣への事後調査報告書提出","保全措置の有効性評価・追加措置の検討"],
  },
  // ── 騒音・振動調査（JIS Z 8731・環境基準準拠）──────────────────────────
  noise: {
    1: ["事業概要・発生源の整理","現地踏査・測定地点候補の選定","既存騒音・振動データの収集（環境省・市区町村常時監視データ）","感受性の高い施設（学校・病院・住宅）のリストアップ","配慮書（騒音・振動章）の作成","主務大臣への配慮書提出"],
    2: ["JIS Z 8731（騒音レベル測定）・ISO 8041（振動）に基づく測定計画の策定","騒音に係る環境基準の地域類型の確認","振動規制法の規制区域の確認","測定機材の選定・キャリブレーション計画","方法書の作成・公告・縦覧（30日間）","住民意見収集","方法書の最終確定・提出"],
    3: ["昼間・夜間・早朝の等価騒音レベル（LAeq）測定","工事機械（建設機械騒音）の発生源測定","交通騒音のロードサイド測定","振動レベルL10・L50・L90の測定（鉛直方向）","暗騒音・バックグラウンドの測定（複数日）","低周波音測定（必要に応じ）","測定データの整理・QC・統計処理"],
    4: ["工事騒音・振動の影響予測（音源モデリング・伝搬計算）","道路交通騒音の予測（ASJ RTN-Model 2018準拠）","振動感覚閾値・規制基準との照合","建設機械騒音予測（距離減衰式）","低周波音の評価","防音壁・振動対策（防振材・減振路盤）の検討","準備書（騒音・振動章）の作成・公告・縦覧（30日間）","住民意見収集・知事意見受理","事業者見解書の作成・提出"],
    5: ["評価書（騒音・振動章）の最終作成・補正","専門家査読・確認","主務大臣確認","評価書の公告・縦覧（30日間）","許認可申請添付"],
    6: ["工事中騒音モニタリング（JIS Z 8731準拠・月1回以上）","振動モニタリング（規制基準超過時は即時対応）","苦情対応記録の管理","供用後騒音モニタリング（年1回）","年次報告書の作成・提出"],
  },
  // ── 大気質調査（大気汚染防止法・環境基準準拠）──────────────────────────
  air: {
    1: ["気象・大気拡散条件の予備調査（AMeDAS・地域気候データ）","排出源・排出物質の特定（NOx・SOx・SPM・PM2.5・VOC・悪臭）","周辺の大気環境基準適用地域・工業地域の確認","配慮書（大気質章）の作成","行政事前協議"],
    2: ["大気質測定計画の策定（環境省大気汚染常時監視マニュアル準拠）","測定地点の選定（排出源の風上・風下・沿道）","測定物質の選定（NO2・SO2・CO・SPM・PM2.5・Ox等）","気象観測計画（風向・風速・日射量・気温）","測定機器の選定・キャリブレーション計画","方法書の作成・公告・縦覧（30日間）","方法書の確定・提出"],
    3: ["大気質の現地測定（季節別・年4回以上）","気象観測（連続観測器設置）","粉じん・飛散物質の測定","悪臭調査（嗅覚測定法・官能試験）","有害大気汚染物質のサンプリング","測定データの整理・QC"],
    4: ["大気拡散モデルによる影響予測（METI-LIS・ADMS等）","環境基準・排出基準・TLV との照合","建設工事粉じんの影響予測","健康リスク評価（ベンゼン・ダイオキシン等）","低減措置（高煙突・脱硫・脱硝・袋フィルター等）の検討","準備書（大気質章）の作成・公告・縦覧（30日間）","住民意見収集・知事意見受理","事業者見解書の作成・提出"],
    5: ["評価書（大気質章）の最終作成","専門家査読","主務大臣確認","公告・縦覧（30日間）","大気汚染防止法届出添付"],
    6: ["工事中粉じんモニタリング（散水等対策の確認）","供用後大気質モニタリング（年1回）","排出基準遵守状況の確認","常時監視との比較評価","年次報告書の作成・提出"],
  },
  // ── 水質・河川調査（水質汚濁防止法・環境基準準拠）──────────────────────
  river: {
    1: ["流域・集水域の地形・地質情報の収集","既存河川データ（水量・水質・生物）の整理","水質汚濁に係る環境基準（類型指定）の確認","利水・治水の現状把握","配慮書（水環境章）の作成","所管河川管理者への事前協議"],
    2: ["調査断面・採水地点の設計","魚類・底生生物・付着藻類・植物プランクトンの調査手法選定","水質測定項目の選定（環境省河川水質測定指針準拠・28項目以上）","流量測定方法の決定（電磁流速計・浮子法）","底質調査の計画","方法書の作成・公告・縦覧（30日間）","漁業協同組合・水利権者への事前説明","方法書の確定・提出"],
    3: ["水質測定（BOD・COD・SS・DO・pH・大腸菌・重金属等）","流量・流速測定","魚類電気ショッカー調査または投網調査（春・秋）","底生生物（ベントス）のサーバー網採取","付着藻類・植物プランクトンの採取・同定","河岸植生調査","底質調査（COD・硫化物・重金属）","水温・塩分・濁度の連続観測"],
    4: ["水質データの環境基準との照合（BOD・COD・SS等）","魚類・底生生物の種組成・多様性指数の算出","水生生態系健全度の評価（BQI・PTSIなど）","事業による流況変化・水質影響の予測（数値モデル）","湖沼・ダム貯水池の富栄養化予測","保全措置の検討（仮設防砂堰・濁水処理）","準備書（水環境章）の作成・公告・縦覧（30日間）","漁業協同組合・水利権者への説明","住民意見収集・知事意見受理","事業者見解書の作成・提出"],
    5: ["評価書（水環境章）の最終作成","専門家査読","主務大臣確認","公告・縦覧（30日間）","水質汚濁防止法届出添付"],
    6: ["工事中水質モニタリング（月2回以上）","濁水・土砂流出の監視・記録","魚類等生息状況の追跡調査（年1回）","底生生物モニタリング","事後調査報告書の作成・提出"],
  },
  // ── 土壌汚染調査（土壌汚染対策法準拠）──────────────────────────────────
  soil: {
    1: ["土地利用履歴調査（土対法・ASTM E1527 Phase I相当）","地質・水文地質情報の収集","汚染リスク物質・施設の特定（特定有害物質25種）","概況調査計画書の作成","都道府県知事への調査計画書提出（土対法第3条・4条）"],
    2: ["サンプリング地点の設計（グリッドサンプリング10m or 30m格子）","分析項目の選定（土対法特定有害物質25種・溶出量基準・含有量基準）","地下水モニタリング計画（観測井の設計）","指定調査機関の選定（土壌汚染対策法指定）","調査工程・安全衛生計画","方法書の確定"],
    3: ["ボーリング調査・土壌サンプリング（深度別）","地下水サンプリング（観測井設置・汲み上げ）","土壌ガス調査（VOC・四塩化炭素等）","分析機関への試料送付（指定分析方法）","分析結果の受領・QC確認","追加調査の判断"],
    4: ["土壌・地下水の溶出量基準・含有量基準との照合","汚染状況の3次元マッピング","汚染土量の算定","健康リスク評価（暴露経路分析）","浄化対策工法の比較検討（コスト・期間・効果）（掘削除去・土壌洗浄・原位置浄化・封じ込め）","土地利用制限・指定区域の指定申請（土対法第11条）","土壌汚染状況調査結果報告書の作成","都道府県知事への提出"],
    5: ["形質変更時要届出区域または要措置区域の指定対応","周辺住民・地権者への説明","浄化措置計画書の作成・提出（土対法第18条）","認可申請","行政窓口との協議"],
    6: ["浄化工事中のモニタリング（月1回）","地下水のポストモニタリング（四半期ごと）","浄化完了確認調査（土対法指定調査機関）","浄化完了証明書の取得","土壌汚染台帳の更新手続き（土対法第34条）"],
  },
  // ── アスベスト調査（大気汚染防止法・石綿障害予防規則準拠）──────────────
  asb: {
    1: ["建物・施設の使用年代・建材の予備調査（1975年以前の建物は特に注意）","石綿含有建材使用図面・仕様書の収集","石綿分析機関の選定（環境計量証明事業所）","事前調査計画書の作成","所轄労働基準監督署への事前届出（大防法第18条の15）"],
    2: ["石綿含有建材の目視・書面調査計画","サンプリング地点・部位の選定（レベル1〜3別）","位相差顕微鏡・偏光顕微鏡・走査型電子顕微鏡分析計画","分析方法書の作成（JIS A 1481準拠）","調査前の安全衛生計画（作業主任者・保護具）"],
    3: ["レベル1（吹付け）の目視・書面確認","レベル2（保温材・断熱材）の確認","レベル3（成形板・床材等）の確認","サンプリング採取・分析機関への送付","JIS A 1481-1〜6に基づく定量・定性分析","石綿含有建材の数量・状態・劣化度の記録","飛散性リスクの評価（飛散性3段階）"],
    4: ["石綿含有材料の総量集計","飛散リスクレベルの評価","除去・封じ込め・囲い込み工法の比較検討","除去費用概算の算定","石綿事前調査結果報告書の作成（大防法・石綿則）","石綿含有建材調査者（国家資格）の署名・押印"],
    5: ["報告書の行政提出（都道府県・政令市・市区町村）","建築物解体等作業届出（石綿則第5条・労安法第88条）","住民・関係者への説明","意見・質問への回答"],
    6: ["除去工事中の空気中石綿濃度モニタリング（位相差顕微鏡法）","作業記録・廃棄物マニフェストの管理","最終クリアランス検査（位相差顕微鏡または電子顕微鏡）","クリアランス証明書の発行","記録の30年保管（石綿障害予防規則第35条）"],
  },
  // ── 生態系調査（TNFD LEAPアプローチ・基本的事項準拠）────────────────────
  eco: {
    1: ["広域生態系・緑地ネットワークの情報収集（第3回自然環境保全基礎調査等）","重要生態系（JNBPA・OECMエリア・ラムサール湿地等）の確認","TNFD LEAPアプローチによる自然関連依存・リスクの予備評価","生物多様性ホットスポット・生態系感受性の評価","配慮書（生態系章）の作成","主務大臣への提出"],
    2: ["生態系調査手法（景観生態学・植生調査・動物調査）の設計","キーストーン種・指標種・傘種の選定","生態系サービス（供給・調節・文化・基盤）の評価指標の設定","TNFD開示指標の設定（SBI・SBTn等）","方法書の作成・公告・縦覧（30日間）","自然保護団体・専門家への事前説明","方法書の確定・提出"],
    3: ["植生詳細調査（コドラート法・ライントランセクト法・1/2500植生図作成）","鳥類・哺乳類の行動圏・移動経路・採餌場調査","昆虫類（送粉者・分解者）の多様性調査","土壌動物・菌根菌の調査","河川・湿地の水文環境調査","生態系機能評価（一次生産量・分解速度・炭素貯留量）","炭素量・生態系サービス価値の試算"],
    4: ["生態系タイプ別の影響マトリクス作成","生態系サービスへの影響定量化","生物多様性ネットポジティブ目標との整合確認","生物多様性オフセット・NbS（自然を基盤とした解決策）の検討","TNFDレポーティング指標の算出（Metric 1〜4）","準備書（生態系章）の作成・公告・縦覧（30日間）","自然保護団体・専門家への説明","住民意見収集・知事意見受理","事業者見解書の作成・提出"],
    5: ["評価書（生態系章）の最終作成","TNFD整合アニュアルレポートの作成","専門家査読","主務大臣確認","公告・縦覧（30日間）"],
    6: ["生態系モニタリング計画の実施（SBTn準拠）","重要種の追跡調査","生態系サービスの継続評価","修復成果の定量的検証","年次TNFDレポートの作成","主務大臣への事後調査報告書提出"],
  },
};

function makeTasksFromLabels(labels) {
  return labels.map((label, i) => ({
    id: `t${Date.now()}_${i}`,
    label,
    done: false,
  }));
}

function makeTasksForSurveyType(surveyType) {
  const base = TEMPLATE_TASKS[surveyType] || TEMPLATE_TASKS.bio;
  const result = {};
  for (let s = 1; s <= 6; s++) {
    result[s] = makeTasksFromLabels(base[s] || base[1]);
  }
  return result;
}

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
  { id:1, name:"北海道洋上風力発電EIA",  client:"J-Power株式会社",          type:"wind", stage:3, pref:"北海道", deadline:"2026-08-15", species:[], redListCount:0, risk:"high",   progress:33, manager:"田中 誠一", area:"2400", budget:"38000000", desc:"北海道沖合の洋上風力発電プロジェクト（45MW）の環境影響評価。渡り鳥ルートとの重複が課題。", projectClass:"1", tasks:{1:makeInitialTasks(1).map(t=>({...t,done:true})),2:makeInitialTasks(2).map(t=>({...t,done:true})),3:makeInitialTasks(3),4:makeInitialTasks(4),5:makeInitialTasks(5),6:makeInitialTasks(6)}, comments:[], documents:[] },
  { id:2, name:"東京湾岸道路拡張事業",   client:"東日本高速道路株式会社",    type:"road", stage:5, pref:"千葉県", deadline:"2026-05-30", species:[], redListCount:2, risk:"medium", progress:67, manager:"佐藤 由美", area:"580",   budget:"12500000", desc:"千葉県沿岸部の国道延伸工事。干潟・砂浜の希少種への影響評価が主要論点。", projectClass:"1", tasks:{1:makeInitialTasks(1).map(t=>({...t,done:true})),2:makeInitialTasks(2).map(t=>({...t,done:true})),3:makeInitialTasks(3).map(t=>({...t,done:true})),4:makeInitialTasks(4).map(t=>({...t,done:true})),5:makeInitialTasks(5),6:makeInitialTasks(6)}, comments:[], documents:[] },
  { id:3, name:"大阪湾埋立プロジェクト", client:"大林組",                    type:"reclaim", stage:2, pref:"大阪府", deadline:"2027-02-28", species:[], redListCount:0, risk:"low",    progress:17, manager:"山田 健太", area:"340",   budget:"8200000",  desc:"大阪湾の港湾拡張に伴う埋立事業。海洋生物多様性への影響評価。", projectClass:"1", tasks:{1:makeInitialTasks(1).map(t=>({...t,done:true})),2:makeInitialTasks(2),3:makeInitialTasks(3),4:makeInitialTasks(4),5:makeInitialTasks(5),6:makeInitialTasks(6)}, comments:[], documents:[] },
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

function StageBar({ stage, project }) {
  const stages = project?.customStages || STAGES;
  const total = stages.length;
  const curIdx = stages.findIndex(s => s.id === stage);
  const displayNum = curIdx >= 0 ? curIdx + 1 : stage;
  return <div style={{ display:"flex", gap:3, alignItems:"center" }}>
    {stages.map((s,i) => <div key={s.id} title={s.label} style={{ flex:1, height:7, borderRadius:4,
      background:i<curIdx?s.color:i===curIdx?s.color:C.borderLight, opacity:i===curIdx?1:i<curIdx?0.7:1 }} />)}
    <span style={{ marginLeft:8, fontSize:13, color:C.textMuted,
      fontFamily:"'DM Mono',monospace", fontWeight:600, whiteSpace:"nowrap" }}>{displayNum}/{total}</span>
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
    <div style={{ width:"min(460px, 92vw)" }}>
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
function Header({ org, currentUser, onLogout, onOpenProfile, setActive, onMenuOpen }) {
  const [menu, setMenu] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
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
    {org && !isMobile && <div style={{ background:C.light, border:`1px solid ${C.primary}33`,
      borderRadius:8, padding:"7px 14px", display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ width:8, height:8, borderRadius:"50%", background:C.mid }} />
      <span style={{ color:C.primary, fontSize:14, fontWeight:600 }}>{org.name}</span>
      <Chip color={PLANS[org.plan]?.color||C.primary}>{PLANS[org.plan]?.label}</Chip>
    </div>}
    <div style={{ flex:1 }} />
    {isMobile && <button onClick={onMenuOpen} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.primary, padding:"4px 8px" }}>☰</button>}
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
function Sidebar({ active, setActive, mobileOpen, onClose }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const nav = [
    { id:"dashboard",  icon:"◉",  label:"ダッシュボード" },
    { id:"scoping",    icon:"⬡",  label:"スコーピング・調査設計" },
    { id:"species",    icon:"🌿", label:"種・生息地データ" },
    { id:"reports",    icon:"📋", label:"報告書生成" },
    { id:"compliance", icon:"⚖️", label:"法令ライブラリ" },
    { id:"monitoring", icon:"📊", label:"事後モニタリング" },
    { id:"account",    icon:"🏢", label:"アカウント管理" },
  ];
  if (isMobile && !mobileOpen) return null;
  return <>
    {isMobile && <div onClick={onClose} style={{ position:"fixed", inset:0, background:"#0005", zIndex:150 }}/>}
    <div style={{ width:236, background:C.surface, borderRight:`1px solid ${C.border}`,
      height:"calc(100vh - 64px)",
      position: isMobile ? "fixed" : "sticky",
      top:64, left:0, zIndex:isMobile?200:1,
      flexShrink:0, display:"flex", flexDirection:"column",
      boxShadow: isMobile ? C.shadowMd : "none",
      transform: isMobile && !mobileOpen ? "translateX(-100%)" : "translateX(0)",
      transition:"transform 0.25s ease" }}>
    <nav style={{ flex:1, padding:"14px 0", overflowY:"auto" }}>
      {nav.map((item,i) => <React.Fragment key={item.id}>
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
      </React.Fragment>)}
    </nav>
    {/* Mobile sync status - subtle, not promotional */}
    <div style={{ padding:"12px 18px", borderTop:`1px solid ${C.borderLight}`,
      display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ width:7, height:7, borderRadius:"50%", background:"#059669",
        flexShrink:0, boxShadow:"0 0 0 2px #D1FAE5" }} />
      <span style={{ color:C.textFaint, fontSize:11 }}>モバイル同期中</span>
    </div>
  </div>
  </>;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ projects, setSelectedProject, setActive, onNew, onDelete, currentUser }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
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

    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap:14, marginBottom:28 }}>
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
    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap:16 }}>
      {projects.map(p => <ProjectCard key={p.id} project={p}
        onClick={()=>{ setSelectedProject(p); setActive("project"); }}
        onDelete={["admin","pm"].includes(currentUser?.role) ? ()=>onDelete(p.id) : null}
      />)}
    </div>
  </div>;
}

function ProjectCard({ project, onClick, onDelete }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
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
    <StageBar stage={project.stage} project={project} />
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
    <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap:10, marginTop:12 }}>
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
// ── DOCUMENT STATUS CONFIG ────────────────────────────────────────────────────
const DOC_STATUSES = ["作業中","レビュー中","承認済","提出済","却下"];
const DOC_STATUS_COLOR = {
  "作業中":  { c:C.amber,   bg:C.amberLight },
  "レビュー中":{ c:C.blue,    bg:C.blueLight },
  "承認済":  { c:C.mid,     bg:C.light },
  "提出済":  { c:C.primary, bg:C.light },
  "却下":    { c:C.red,     bg:C.redLight },
};

const FILE_ICONS = {
  pdf:"📕", docx:"📘", doc:"📘", xlsx:"📗", xls:"📗",
  pptx:"📙", ppt:"📙", jpg:"🖼️", jpeg:"🖼️", png:"🖼️",
  zip:"🗜️", csv:"📊", default:"📄"
};
function fileIcon(name) {
  const ext = (name||"").split(".").pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}
function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes+"B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1)+"KB";
  return (bytes/(1024*1024)).toFixed(1)+"MB";
}

function DocumentsTab({ project, onUpdate, currentUser }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [uploading, setUploading]   = useState(false);
  const [uploadProg, setUploadProg] = useState(0);
  const [dragOver, setDragOver]     = useState(false);
  const [editDoc, setEditDoc]       = useState(null); // doc being status-edited
  const [filter, setFilter]         = useState("all");
  // 登録先：この文書がどの段階・どの作業の成果物かを必ず紐づける
  const [upStage, setUpStage]       = useState(project.stage);
  const [upTaskId, setUpTaskId]     = useState("");
  const fileRef = React.useRef();

  const docs = project.documents || [];
  const projStages = project.customStages || STAGES;
  const stageTaskList = project.tasks?.[upStage] || [];

  // ── helpers ─────────────────────────────────────────────────────────────
  const saveDoc = (updated) => onUpdate({ ...project, documents: updated });

  const addDocRecord = (file, url, extra={}) => {
    const task = stageTaskList.find(t => t.id === upTaskId);
    const doc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      url,  // null until uploaded (offline)
      status: "作業中",
      uploadedBy: currentUser?.name || "自分",
      uploadedAt: new Date().toISOString().split("T")[0],
      // 証拠の連鎖：文書は必ず「段階」に、可能なら「作業項目」に紐づく
      stage: Number(upStage) || project.stage,
      taskId: task?.id || null,
      taskLabel: task?.label || null,
      uploadId: extra.uploadId || null,
      pending: !!extra.pending, // true = まだSupabase Storageへ未アップロード（オフライン）
    };
    saveDoc([...docs, doc]);
  };

  const deleteDoc = (id) => {
    if (!window.confirm("このファイルを削除しますか？")) return;
    saveDoc(docs.filter(d => d.id !== id));
  };

  const updateStatus = (id, status) => {
    saveDoc(docs.map(d => d.id===id ? {...d, status} : d));
    setEditDoc(null);
  };

  // ── upload (offline-safe) ─────────────────────────────────────────────────
  // 1) 常にまずローカル(IndexedDB)へBlobを保存 → 現場でオフラインでも消えない
  // 2) オンラインなら即Storageへ。失敗/オフラインなら pending のまま、後で自動同期
  const handleFiles = async (files) => {
    for (const file of Array.from(files)) {
      setUploading(true); setUploadProg(25);
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const path = `${project.id}/${Date.now()}_${file.name}`;

      let url = null, pending = true;
      if (isConfigured) {
        // Persist the blob locally FIRST so an offline upload is never lost
        await saveUpload({ id:uploadId, projectId:String(project.id), path,
          blob:file, name:file.name, kind:"doc" }).catch(()=>{});
        if (navigator.onLine) {
          setUploadProg(70);
          const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert:true });
          if (!error) {
            const { data } = supabase.storage.from("project-docs").getPublicUrl(path);
            url = data?.publicUrl || null; pending = false;
            await deleteUpload(uploadId).catch(()=>{});
          }
        }
      } else {
        url = URL.createObjectURL(file); pending = false; // demo mode
      }

      setUploadProg(100);
      addDocRecord(file, url, { uploadId, pending });
      setUploading(false); setUploadProg(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDownload = (doc) => {
    if (!doc.url) { alert("このファイルはダウンロードできません（URLなし）"); return; }
    const a = document.createElement("a");
    a.href = doc.url; a.download = doc.name; a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── filtered list ────────────────────────────────────────────────────────
  const filtered = filter==="all" ? docs
    : filter==="stage" ? docs.filter(d=>d.stage===project.stage)
    : docs.filter(d=>d.status===filter);

  const stageCountMap = {};
  docs.forEach(d=>{ stageCountMap[d.stage]=(stageCountMap[d.stage]||0)+1; });

  return <div>
    {/* Header */}
    <div style={{ display:"flex", justifyContent:"space-between",
      alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
      <div>
        <div style={{ color:C.text, fontSize:16, fontWeight:700,
          fontFamily:"'Noto Serif JP',serif" }}>成果物・証拠文書台帳</div>
        <div style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>
          {docs.length}件のファイル
          {!isConfigured && <span style={{ color:C.amber, marginLeft:8,
            fontSize:12 }}>⚠ デモモード（セッション中のみ保存）</span>}
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <Btn size="sm" icon="⬆" onClick={()=>fileRef.current?.click()}
          disabled={uploading}>
          {uploading ? `アップロード中 ${uploadProg}%` : "ファイルを追加"}
        </Btn>
      </div>
      <input ref={fileRef} type="file" multiple style={{ display:"none" }}
        onChange={e=>handleFiles(e.target.files)} />
    </div>

    {/* この機能の役割 */}
    <div style={{ background:C.light, border:`1px solid ${C.primary}33`, borderRadius:10,
      padding:"11px 14px", marginBottom:14, fontSize:12.5, color:C.textMid, lineHeight:1.7 }}>
      <strong style={{ color:C.primary }}>この画面の役割：</strong>
      法定手続きの各段階で発生する成果物（測定データ・図面・議事録・行政提出書類など）を
      <strong>段階・作業項目に紐づけて</strong>保管し、審査状態（作業中→レビュー中→承認済→提出済）を管理します。
      ここに登録した文書は、生成される方法書・準備書の<strong>巻末「文書台帳」に自動掲載</strong>されます。
    </div>

    {/* 登録先の指定（証拠の連鎖） */}
    <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap",
      alignItems:"flex-end", background:C.surface, border:`1px solid ${C.border}`,
      borderRadius:10, padding:"12px 14px" }}>
      <div style={{ flex:"0 0 auto" }}>
        <label style={{ display:"block", color:C.textMid, fontSize:12, fontWeight:700, marginBottom:5 }}>
          登録先の段階
        </label>
        <select value={upStage} onChange={e=>{ setUpStage(Number(e.target.value)); setUpTaskId(""); }}
          style={{ ...INP, fontSize:13, padding:"7px 10px" }}>
          {projStages.map(s=><option key={s.id} value={s.id}>第{s.id}段階 {s.short||s.label}</option>)}
        </select>
      </div>
      <div style={{ flex:1, minWidth:220 }}>
        <label style={{ display:"block", color:C.textMid, fontSize:12, fontWeight:700, marginBottom:5 }}>
          対応する作業項目（この文書は何の成果物か）
        </label>
        <select value={upTaskId} onChange={e=>setUpTaskId(e.target.value)}
          style={{ ...INP, fontSize:13, padding:"7px 10px", width:"100%" }}>
          <option value="">段階全体（作業項目を指定しない）</option>
          {stageTaskList.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
    </div>

    {/* Filter pills */}
    {docs.length > 0 && <div style={{ display:"flex", gap:6, marginBottom:14,
      flexWrap:"wrap" }}>
      {[["all","すべて"],["stage","この段階"],
        ...DOC_STATUSES.map(s=>[s,s])].map(([k,v])=>(
        <button key={k} onClick={()=>setFilter(k)} style={{
          padding:"4px 12px", borderRadius:20, border:`1px solid ${filter===k?C.primary:C.borderLight}`,
          background:filter===k?C.primary:C.surface, color:filter===k?C.white:C.textMuted,
          cursor:"pointer", fontSize:12, fontFamily:"'Noto Sans JP',sans-serif",
          fontWeight:filter===k?700:400 }}>{v}
        </button>
      ))}
    </div>}

    {/* Drop zone */}
    <div onDrop={handleDrop} onDragOver={e=>{e.preventDefault();setDragOver(true);}}
      onDragLeave={()=>setDragOver(false)}
      onClick={()=>!uploading&&fileRef.current?.click()}
      style={{ border:`2px dashed ${dragOver?C.primary:C.borderLight}`,
        borderRadius:12, padding:"20px", textAlign:"center", marginBottom:16,
        background:dragOver?C.light:C.bg, cursor:"pointer",
        transition:"all 0.15s" }}>
      {uploading
        ? <div>
            <div style={{ color:C.primary, fontWeight:700, marginBottom:8 }}>
              アップロード中... {uploadProg}%
            </div>
            <div style={{ height:6, background:C.borderLight, borderRadius:3 }}>
              <div style={{ height:"100%", borderRadius:3, background:C.primary,
                width:`${uploadProg}%`, transition:"width 0.2s" }}/>
            </div>
          </div>
        : <div style={{ color:C.textMuted, fontSize:13 }}>
            <div style={{ fontSize:28, marginBottom:6 }}>📁</div>
            ファイルをドラッグ＆ドロップ、またはクリックして選択
            <div style={{ fontSize:12, color:C.textFaint, marginTop:4 }}>
              PDF・Word・Excel・画像など対応
            </div>
          </div>
      }
    </div>

    {/* Document list */}
    {filtered.length === 0
      ? <div style={{ color:C.textFaint, fontSize:13, textAlign:"center",
          padding:"32px 0" }}>
          {docs.length===0 ? "まだファイルがありません" : "該当するファイルなし"}
        </div>
      : projStages.filter(s=>filtered.some(d=>Number(d.stage)===s.id)).map(sg => (
        <div key={sg.id} style={{ marginBottom:16 }}>
        {/* 段階ごとのグループ見出し — 文書は法定手続きの段階に属する */}
        <div style={{ display:"flex", alignItems:"center", gap:8, margin:"2px 0 8px" }}>
          <span style={{ width:9, height:9, borderRadius:3, background:sg.color||C.textMuted }}/>
          <span style={{ fontSize:13, fontWeight:700, color:C.text }}>
            第{sg.id}段階 {sg.short||sg.label}</span>
          <span style={{ fontSize:11, color:C.textFaint }}>
            {filtered.filter(d=>Number(d.stage)===sg.id).length}件</span>
        </div>
        {filtered.filter(d=>Number(d.stage)===sg.id).map(doc => (
        <div key={doc.id} style={{ display:"flex", alignItems:"center", gap:12,
          padding:"12px 14px", background:C.surface, borderRadius:10, marginBottom:8,
          border:`1px solid ${C.borderLight}`,
          boxShadow:"0 1px 3px #0001" }}>
          <span style={{ fontSize:24, flexShrink:0 }}>{fileIcon(doc.name)}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:C.text, fontSize:14, fontWeight:600,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {doc.name}
            </div>
            <div style={{ color:C.textFaint, fontSize:11, marginTop:2,
              display:"flex", gap:8, flexWrap:"wrap" }}>
              <span>{fmtSize(doc.size)}</span>
              <span>·</span>
              <span>{doc.uploadedAt}</span>
              <span>·</span>
              {doc.taskLabel
                ? <span style={{ color:C.mid, fontWeight:700 }}>📎 {doc.taskLabel}</span>
                : <span>段階全体の資料</span>}
              {doc.uploadedBy && <><span>·</span><span>{doc.uploadedBy}</span></>}
              {doc.pending && <span style={{ color:C.amber, fontWeight:700 }}>· ⏳ 同期待ち（オフライン保存済）</span>}
            </div>
          </div>
          {/* Status badge — click to change */}
          <div style={{ position:"relative", flexShrink:0 }}>
            <div onClick={()=>setEditDoc(editDoc===doc.id?null:doc.id)}
              style={{ cursor:"pointer" }}>
              <Chip color={(DOC_STATUS_COLOR[doc.status]||{}).c||C.textMuted}
                bg={(DOC_STATUS_COLOR[doc.status]||{}).bg||C.bg}>
                {doc.status}▾
              </Chip>
            </div>
            {editDoc===doc.id && <div style={{ position:"absolute", right:0, top:"100%",
              marginTop:4, background:C.surface, border:`1px solid ${C.border}`,
              borderRadius:8, boxShadow:C.shadowMd, zIndex:100, overflow:"hidden",
              minWidth:110 }}>
              {DOC_STATUSES.map(s=>(
                <div key={s} onClick={()=>updateStatus(doc.id,s)}
                  style={{ padding:"9px 14px", cursor:"pointer", fontSize:13,
                    color:s===doc.status?C.primary:C.text, fontWeight:s===doc.status?700:400,
                    background:s===doc.status?C.light:"transparent" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                  onMouseLeave={e=>e.currentTarget.style.background=s===doc.status?C.light:"transparent"}>
                  {s}
                </div>
              ))}
            </div>}
          </div>
          {/* Actions */}
          <div style={{ display:"flex", gap:4, flexShrink:0 }}>
            {doc.url && <Btn variant="ghost" size="sm"
              onClick={()=>handleDownload(doc)}>⬇</Btn>}
            <Btn variant="danger" size="sm"
              onClick={()=>deleteDoc(doc.id)}>✕</Btn>
          </div>
        </div>
        ))}
        </div>
      ))
    }
  </div>;
}


function ProjectDetail({ project: initProject, setActive, onUpdate, onSaveTemplate, currentUser }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
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
  const [editingTasks, setEditingTasks] = useState(false);
  const [openNote, setOpenNote] = useState(null); // 記録欄を開いているタスクID
  const projectStages = project.customStages || STAGES;
  const curStageIdx = projectStages.findIndex(s=>s.id===project.stage);
  const cur = projectStages[curStageIdx];
  const stageTasks = project.tasks[project.stage] || [];
  const allDone = stageTasks.every(t=>t.done);
  const doneCount = stageTasks.filter(t=>t.done).length;
  const days = Math.floor((new Date(project.deadline)-new Date())/86400000);

  const push = (updated) => { setProject(updated); onUpdate(updated); };

  // 監査証跡（誰が・いつ・何をしたか）。activity は JSONB 列に保存される。
  const logActivity = (proj, action) => ({
    ...proj,
    activity: [
      { id: crypto.randomUUID(), action, by: currentUser?.name || "不明",
        at: new Date().toLocaleString("ja-JP") },
      ...(proj.activity || []),
    ].slice(0, 500),
  });

  const toggleTask = (taskId) => {
    const task = (project.tasks[project.stage]||[]).find(t=>t.id===taskId);
    const nowDone = !task?.done;
    const newTasks = { ...project.tasks,
      [project.stage]: project.tasks[project.stage].map(t =>
        t.id===taskId ? {...t, done:!t.done} : t) };
    const allNowDone = newTasks[project.stage].every(t=>t.done);
    const stagesCompleted = projectStages.filter(s => (s.id < project.stage) ||
      (s.id===project.stage && allNowDone)).length;
    const newProgress = Math.round((stagesCompleted / projectStages.length) * 100);
    push(logActivity({ ...project, tasks:newTasks, progress:newProgress },
      `タスクを${nowDone?"完了":"未完了に変更"}：${task?.label||""}`));
  };

  // タスクごとの記録（調査結果・数値・担当者メモ等）を保存。
  // tasks は JSONB 列なので、そのまま案件保存で永続化される。
  const setTaskNote = (taskId, note) => {
    const cur = (project.tasks[project.stage]||[]).find(t=>t.id===taskId);
    if((cur?.note||"") === note) return; // 変更なしなら書き込まない
    const label = (project.tasks[project.stage]||[]).find(t=>t.id===taskId)?.label || "";
    const newTasks = { ...project.tasks,
      [project.stage]: (project.tasks[project.stage]||[]).map(t =>
        t.id===taskId ? {...t, note, noteBy:currentUser?.name||"", noteAt:new Date().toLocaleDateString("ja-JP")} : t) };
    push(logActivity({ ...project, tasks:newTasks }, `記録を更新：${label}`));
  };

  const advanceStage = () => {
    const idx = projectStages.findIndex(s => s.id === project.stage);
    if (idx < 0 || idx >= projectStages.length - 1) return;
    const nextStage = projectStages[idx + 1].id;
    const newProgress = Math.round((idx + 1) / projectStages.length * 100);
    push(logActivity({ ...project, stage:nextStage, progress:newProgress },
      `段階を進行：${projectStages[idx+1]?.label||""}`));
  };

  const saveInfo = () => {
    push({ ...project, ...draft }); setEditingInfo(false);
    setSaved(true); setTimeout(()=>setSaved(false),3000);
  };

  // 現場写真の追加（オフライン安全）：Blobをまずローカル保存→オンライン時にStorageへ
  const addSpeciesPhotos = async (files) => {
    for (const file of Array.from(files||[])) {
      if (!/^image\//.test(file.type)) continue;
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const path = `${project.id}/species/${Date.now()}_${file.name.replace(/[^\w.\-]+/g,"_")}`;
      const preview = await makePreview(file).catch(()=>null);
      let url = null, pending = true;
      if (isConfigured) {
        await saveUpload({ id:uploadId, projectId:String(project.id), path,
          blob:file, name:file.name, kind:"species" }).catch(()=>{});
        if (navigator.onLine) {
          const { error } = await supabase.storage.from("project-docs").upload(path, file, { upsert:true });
          if (!error) {
            const { data } = supabase.storage.from("project-docs").getPublicUrl(path);
            url = data?.publicUrl || null; pending = false;
            await deleteUpload(uploadId).catch(()=>{});
          }
        }
      } else { url = preview; pending = false; } // demo mode
      setNewSp(p => ({ ...p, photos:[...(p.photos||[]),
        { id:uploadId, uploadId, url, pending, preview, name:file.name }] }));
    }
  };

  const addSpecies = () => {
    const editing = editSpIdx!==null;
    const stamped = { ...newSp,
      id: editing ? (project.species[editSpIdx]?.id ?? Date.now()) : Date.now(),
      recordedBy: editing ? (project.species[editSpIdx]?.recordedBy || currentUser?.name) : currentUser?.name,
      recordedAt: editing ? (project.species[editSpIdx]?.recordedAt || new Date().toLocaleDateString("ja-JP"))
        : new Date().toLocaleDateString("ja-JP") };
    const updated = { ...project,
      species: editing
        ? project.species.map((s,i) => i===editSpIdx ? stamped : s)
        : [...project.species, stamped],
      redListCount: 0 };
    updated.redListCount = updated.species.filter(s=>["CR","EN","VU","NT"].includes(s.status)).length;
    push(logActivity(updated, `${editing?"確認種を編集":"確認種を追加"}：${newSp.name||""}（${newSp.status}）`));
    setAddingSpecies(false); setNewSp({...BLANK_SPECIES}); setEditSpIdx(null);
  };

  const removeSpecies = (idx) => {
    const removed = project.species[idx];
    const updated = { ...project, species: project.species.filter((_,i)=>i!==idx) };
    updated.redListCount = updated.species.filter(s=>["CR","EN","VU","NT"].includes(s.status)).length;
    push(logActivity(updated, `確認種を削除：${removed?.name||""}`));
  };

  const addComment = () => {
    if (!comment.trim()) return;
    const c = { id:Date.now(), text:comment, author:currentUser?.name||"不明",
      date:new Date().toLocaleDateString("ja-JP"), role:currentUser?.role||"" };
    push(logActivity({ ...project, comments:[...project.comments, c] }, `コメントを投稿`));
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

  // 法定図書の実生成（方法書/準備書）— 印刷(PDF保存) と Word ダウンロード
  const docKindForStage = project.stage >= 4 ? "junbi" : "hoho";
  const printLegalDoc = (kind) => {
    const html = EIA.buildDocument(kind, project);
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open(); d.write(html); d.close();
    let printed = false;
    const doPrint = () => { if(printed) return; printed = true;
      try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){/*noop*/}
      setTimeout(()=>{ try{ document.body.removeChild(f); }catch(e){/*noop*/} }, 3000); };
    f.onload = () => setTimeout(doPrint, 250);
    setTimeout(doPrint, 900);
    push(logActivity(project, `法定図書を生成（${kind==="junbi"?"準備書":"方法書"}・印刷）`));
  };
  const downloadLegalDoc = (kind) => {
    const html = EIA.buildDocument(kind, project);
    const label = kind==="junbi" ? "準備書" : "方法書";
    const blob = new Blob(["﻿", html], { type:"application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label}_${(project.name||"案件").replace(/[\\/:*?"<>|]/g,"_")}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    push(logActivity(project, `法定図書を生成（${label}・Word）`));
  };
  // 種リストCSV（Excel互換・BOM付きUTF-8）
  const downloadSpeciesCSV = () => {
    const head = ["和名","学名","分類","レッドリスト","保護指定","個体数","確認地点","確認日","記録者","備考"];
    const rows = project.species.map(s => [s.name, s.latin, s.type, s.status,
      s.protected?"あり":"", s.count, s.location, s.date, s.recordedBy||"", s.notes||""]);
    const csv = [head, ...rows].map(r => r.map(v =>
      `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿", csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `種リスト_${(project.name||"案件").replace(/[\\/:*?"<>|]/g,"_")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  };

  const TABS = [
    { id:"work",      label:"📋 作業・進捗" },
    { id:"info",      label:"📁 プロジェクト情報" },
    { id:"species",   label:`🌿 確認種リスト (${project.species.length})` },
    { id:"documents", label:"📄 文書管理" },
    { id:"history",   label:`🕐 変更履歴 (${(project.activity||[]).length})` },
  ];

  return <div>
    {/* Header */}
    <div style={{ display:"flex", alignItems:"center", gap:isMobile?8:14, marginBottom:24, flexWrap:"wrap" }}>
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
        <SLabel>環境アセスメント法 — {projectStages.length}段階手続き</SLabel>
        {allDone && curStageIdx < projectStages.length - 1 && (
          <Btn onClick={advanceStage} variant="primary" size="sm" icon="→">
            次の段階へ進む（{projectStages[curStageIdx+1]?.short||projectStages[curStageIdx+1]?.label}へ）
          </Btn>
        )}
      </div>
      <div style={{ display:"flex", gap:4 }}>
        {projectStages.map(s => <div key={s.id} style={{ flex:1 }}>
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
    <div style={{ display:"flex", borderBottom:`2px solid ${C.borderLight}`, marginBottom:20, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
      {TABS.map(t => <button key={t.id} onClick={()=>setTab(t.id)} style={{
        padding:"10px 22px", background:"none", border:"none",
        borderBottom:`3px solid ${tab===t.id?C.primary:"transparent"}`, marginBottom:-2,
        color:tab===t.id?C.primary:C.textMuted, cursor:"pointer",
        fontSize:14, fontWeight:tab===t.id?700:400,
        fontFamily:"'Noto Sans JP',sans-serif" }}>{t.label}</button>)}
    </div>

    {/* ── TAB: WORK ── */}
    {tab==="work" && <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 340px", gap:20 }}>
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
          {/* 縦覧期限バナー */}
          {cur?.juran && (() => {
            const startDate = (project.juranDates||{})[`juran_${project.stage}`];
            if(!startDate) return <div style={{ marginTop:12, padding:"8px 12px",
              background:"rgba(255,255,255,0.5)", borderRadius:8,
              border:`1px dashed ${cur.color}88`, fontSize:12, color:C.textMid }}>
              📅 <strong>縦覧期間（30日間）の開始日を「プロジェクト情報」タブで設定してください</strong>
              {" — "}法定手続き期限の自動計算が有効になります
            </div>;
            const endDate = new Date(new Date(startDate).getTime()+30*86400000).toISOString().split("T")[0];
            const daysLeft = Math.ceil((new Date(endDate)-new Date())/86400000);
            const govDeadline = project.stage===4
              ? new Date(new Date(startDate).getTime()+150*86400000).toISOString().split("T")[0]
              : null;
            return <div style={{ marginTop:12, display:"flex", flexWrap:"wrap", gap:8 }}>
              <div style={{ padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:700,
                background: daysLeft<0?"#F3F4F6":daysLeft<=5?C.redLight:daysLeft<=14?C.amberLight:"rgba(255,255,255,0.6)",
                color: daysLeft<0?C.textMuted:daysLeft<=5?C.red:daysLeft<=14?C.amber:cur.color,
                border:`1px solid ${daysLeft<0?C.borderLight:daysLeft<=5?C.red+"44":daysLeft<=14?C.amber+"44":cur.color+"44"}` }}>
                📋 縦覧終了：{endDate}{daysLeft<0?" （終了済）":` （残${daysLeft}日）`}
              </div>
              {govDeadline && <div style={{ padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:700,
                background:C.purpleLight, color:C.purple, border:`1px solid ${C.purple}44` }}>
                🏛️ 知事意見期限：{govDeadline}
              </div>}
            </div>;
          })()}
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
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <SLabel style={{ margin:0 }}>この段階のタスクチェックリスト</SLabel>
            <Btn variant="ghost" size="sm" onClick={()=>setEditingTasks(true)}>
              ✏️ 全段階を編集
            </Btn>
          </div>
          {stageTasks.map(task => <div key={task.id}
            style={{ padding:"11px 0", borderBottom:`1px solid ${C.borderLight}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div onClick={()=>toggleTask(task.id)} style={{ width:24, height:24, borderRadius:6, flexShrink:0,
                background:task.done?C.primary:C.surface, cursor:"pointer",
                border:`2px solid ${task.done?C.primary:C.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:C.white, fontSize:14, transition:"all 0.15s" }}>
                {task.done?"✓":""}
              </div>
              <span onClick={()=>toggleTask(task.id)} style={{ flex:1, cursor:"pointer",
                color:task.done?C.textMuted:C.text, fontSize:14,
                textDecoration:task.done?"line-through":"none" }}>{task.label}</span>
              {(project.documents||[]).filter(d=>d.taskId===task.id).length>0 &&
                <span onClick={()=>setTab("documents")} title="紐づく文書（文書台帳へ）"
                  style={{ fontSize:11, color:C.mid, fontWeight:700, cursor:"pointer",
                    background:C.light, padding:"3px 7px", borderRadius:6, flexShrink:0 }}>
                  📎{(project.documents||[]).filter(d=>d.taskId===task.id).length}
                </span>}
              <button onClick={()=>setOpenNote(openNote===task.id?null:task.id)}
                style={{ background:"none", border:"none", cursor:"pointer", flexShrink:0,
                  color:task.note?C.primary:C.textFaint, fontSize:12, fontWeight:task.note?700:400,
                  padding:"4px 8px", borderRadius:6 }}>
                {task.note ? "📝 記録あり" : "＋ 記録"}
              </button>
            </div>
            {openNote===task.id && <div style={{ margin:"8px 0 2px 38px" }}>
              {(project.documents||[]).filter(d=>d.taskId===task.id).length>0 &&
                <div style={{ marginBottom:8, display:"flex", flexWrap:"wrap", gap:6 }}>
                  {(project.documents||[]).filter(d=>d.taskId===task.id).map(d=>(
                    <a key={d.id} href={d.url||undefined} target="_blank" rel="noreferrer"
                      style={{ fontSize:11.5, color:C.mid, background:C.light,
                        padding:"3px 8px", borderRadius:6, textDecoration:"none" }}>
                      {fileIcon(d.name)} {d.name}{d.pending?" ⏳":""}
                    </a>
                  ))}
                </div>}
              <textarea defaultValue={task.note||""}
                placeholder="調査結果・実測値・使用機材・担当者・所見など（自動保存されます）"
                onBlur={e=>setTaskNote(task.id, e.target.value)}
                style={{ ...INP, width:"100%", minHeight:72, fontSize:13,
                  fontFamily:"inherit", lineHeight:1.6, resize:"vertical", boxSizing:"border-box" }}/>
              {task.noteAt && <div style={{ fontSize:11, color:C.textFaint, marginTop:3 }}>
                最終更新：{task.noteAt}
              </div>}
            </div>}
          </div>)}
          {allDone && curStageIdx < projectStages.length - 1 && (
            <div style={{ marginTop:16, padding:"14px 16px",
              background:C.light, border:`1px solid ${C.primary}44`,
              borderRadius:10, display:"flex", justifyContent:"space-between",
              alignItems:"center" }}>
              <div>
                <div style={{ color:C.primary, fontWeight:700, fontSize:14 }}>
                  ✅ この段階の全タスクが完了しました
                </div>
                <div style={{ color:C.textMuted, fontSize:13, marginTop:2 }}>
                  次の段階「{projectStages[curStageIdx+1]?.label}」へ進む準備ができています
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
                      {(sp.photos||[]).length>0 && <Chip color={C.mid} bg={C.light} size={11}>📷{(sp.photos||[]).length}</Chip>}
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

        {/* 法定図書の生成（実データを差し込んだ草案を即時出力） */}
        <Card style={{ marginBottom:20 }}>
          <SLabel>法定図書の生成</SLabel>
          <div style={{ color:C.textMid, fontSize:13, marginBottom:14, lineHeight:1.6 }}>
            この案件のデータ（確認種 {project.species.length}種・作業記録・事業概要）を
            主務省令の章建てに自動差込した{docKindForStage==="junbi"?"準備書":"方法書"}草案を生成します。
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <Btn onClick={()=>printLegalDoc(docKindForStage)} icon="🖨️">
              {docKindForStage==="junbi"?"準備書":"方法書"}を印刷 / PDF保存
            </Btn>
            <Btn variant="secondary" onClick={()=>downloadLegalDoc(docKindForStage)} icon="⬇️">
              Word (.doc) をダウンロード
            </Btn>
            {docKindForStage==="junbi" &&
              <Btn variant="ghost" onClick={()=>downloadLegalDoc("hoho")}>方法書も出力</Btn>}
            {project.species.length > 0 &&
              <Btn variant="ghost" onClick={downloadSpeciesCSV} icon="📊">種リストCSV</Btn>}
          </div>
          <div style={{ marginTop:12, fontSize:12, color:C.textMuted }}>
            印刷ダイアログで「PDFに保存」を選ぶとPDF化できます。より詳細な設定は「報告書」ページへ。
          </div>
        </Card>

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
              <span style={{ color:C.textMid, fontSize:14 }}>{projectStages.length}段階中</span>
              <span style={{ color:C.primary, fontSize:18, fontWeight:800 }}>{project.progress}%</span>
            </div>
            <div style={{ height:14, background:C.bg, borderRadius:7, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${project.progress}%`,
                background:`linear-gradient(90deg,${C.primary},${C.mid})`,
                borderRadius:7, transition:"width 0.4s" }} />
            </div>
          </div>
          {projectStages.map(s => {
            const done = projectStages.findIndex(x=>x.id===project.stage) > projectStages.findIndex(x=>x.id===s.id);
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

      {/* ── 法的要件・縦覧期限カード ── */}
      <Card style={{ gridColumn:"1/-1" }}>
        <SLabel>法的要件・縦覧期限管理</SLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12, marginTop:12 }}>
          {/* 事業区分 */}
          <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px",
            border:`1px solid ${C.borderLight}` }}>
            <div style={{ color:C.textMuted, fontSize:11, fontWeight:700,
              fontFamily:"'DM Mono',monospace", letterSpacing:"0.05em", marginBottom:6 }}>
              事業区分
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {[["1","第一種事業"],["2","第二種事業"],["ordinance","条例のみ"]].map(([v,l])=>(
                <button key={v} onClick={()=>push({...project,projectClass:v})}
                  style={{ padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:12,
                    border:`1.5px solid ${(project.projectClass||"1")===v?C.primary:C.borderLight}`,
                    background:(project.projectClass||"1")===v?C.primary:"transparent",
                    color:(project.projectClass||"1")===v?C.white:C.textMuted, fontWeight:(project.projectClass||"1")===v?700:400,
                    fontFamily:"'Noto Sans JP',sans-serif" }}>{l}</button>
              ))}
            </div>
            {PROJECT_CLASS_THRESHOLDS[project.type] && (
              <div style={{ color:C.textFaint, fontSize:11, marginTop:8, lineHeight:1.5 }}>
                {(project.projectClass||"1")==="1"
                  ? PROJECT_CLASS_THRESHOLDS[project.type].class1
                  : PROJECT_CLASS_THRESHOLDS[project.type].class2}
              </div>
            )}
          </div>

          {/* 縦覧期間トラッカー */}
          {projectStages.filter(s=>s.juran).map(s=>{
            const startKey = `juran_${s.id}`;
            const startDate = (project.juranDates||{})[startKey];
            const endDate = startDate
              ? new Date(new Date(startDate).getTime() + 30*86400000).toISOString().split("T")[0]
              : null;
            const govDeadline = s.id===4 && startDate
              ? new Date(new Date(startDate).getTime() + (30+120)*86400000).toISOString().split("T")[0]
              : null;
            const today = new Date();
            const daysLeft = endDate ? Math.ceil((new Date(endDate)-today)/86400000) : null;
            const govDaysLeft = govDeadline ? Math.ceil((new Date(govDeadline)-today)/86400000) : null;
            return <div key={s.id} style={{ background:C.bg, borderRadius:10,
              padding:"12px 14px", border:`1px solid ${s.id===project.stage?s.color+"44":C.borderLight}` }}>
              <div style={{ color:s.color, fontSize:11, fontWeight:700,
                fontFamily:"'DM Mono',monospace", letterSpacing:"0.05em", marginBottom:6 }}>
                第{s.id}段階 {s.label} — 公告縦覧期間
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
                <label style={{ color:C.textMuted, fontSize:12 }}>縦覧開始日：</label>
                <input type="date" value={startDate||""}
                  onChange={e=>push({...project, juranDates:{...(project.juranDates||{}), [startKey]:e.target.value}})}
                  style={{ ...INP, fontSize:12, padding:"4px 8px", flex:1 }} />
              </div>
              {endDate && <div style={{ fontSize:12 }}>
                <div style={{ color:C.textMid }}>縦覧終了日：<strong>{endDate}</strong>
                  {daysLeft!==null && <span style={{ marginLeft:8,
                    color:daysLeft<0?"#6B7280":daysLeft<=5?C.red:daysLeft<=14?C.amber:C.mid,
                    fontWeight:700 }}>
                    {daysLeft<0?"（終了済）":`残${daysLeft}日`}
                  </span>}
                </div>
                {govDeadline && <div style={{ color:C.textMid, marginTop:4 }}>
                  知事意見期限：<strong>{govDeadline}</strong>
                  {govDaysLeft!==null && <span style={{ marginLeft:8,
                    color:govDaysLeft<0?"#6B7280":govDaysLeft<=30?C.red:C.amber,
                    fontWeight:700 }}>
                    {govDaysLeft<0?"（期限終了）":`残${govDaysLeft}日`}
                  </span>}
                  <span style={{ color:C.textFaint, fontSize:11, marginLeft:4 }}>（縦覧終了後4ヶ月）</span>
                </div>}
              </div>}
            </div>;
          })}
        </div>

        {/* 地方条例チェック */}
        <div style={{ marginTop:12, padding:"10px 14px", background:C.amberLight,
          border:`1px solid ${C.amber}33`, borderRadius:8, fontSize:12 }}>
          <span style={{ color:C.amber, fontWeight:700 }}>⚖️ 都道府県条例確認：</span>
          <span style={{ color:C.textMid, marginLeft:6 }}>
            {project.pref}では独自の環境アセスメント条例が存在する可能性があります。
            <a href="https://www.env.go.jp/policy/assess/1-1jichitai/index.html"
              target="_blank" rel="noreferrer"
              style={{ color:C.blue, marginLeft:4, textDecoration:"none", fontWeight:600 }}>
              環境省・地方公共団体アセス一覧 →
            </a>
          </span>
        </div>
      </Card>
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
                    <td style={{ padding:"12px 14px" }}>
                      <div style={{ color:C.text, fontSize:14, fontWeight:700 }}>{sp.name}</div>
                      {(sp.photos||[]).length>0 && <div style={{ display:"flex", gap:4, marginTop:5 }}>
                        {(sp.photos||[]).slice(0,3).map(ph=>(
                          <a key={ph.id} href={ph.url||ph.preview} target="_blank" rel="noreferrer">
                            <img src={ph.url||ph.preview} alt=""
                              style={{ width:34, height:34, objectFit:"cover", borderRadius:6,
                                border:`1.5px solid ${ph.pending?C.amber:C.borderLight}` }}/>
                          </a>
                        ))}
                        {(sp.photos||[]).length>3 && <span style={{ fontSize:11, color:C.textMuted,
                          alignSelf:"center" }}>+{(sp.photos||[]).length-3}</span>}
                      </div>}
                    </td>
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
    {tab==="documents" && <DocumentsTab project={project} currentUser={currentUser}
      onUpdate={(u)=>push(logActivity(u, "文書を更新（追加・状態変更）"))} />}

    {/* ── TAB: HISTORY (audit trail) ── */}
    {tab==="history" && <div>
      <SLabel>変更履歴 — 誰が・いつ・何をしたか</SLabel>
      <div style={{ color:C.textMuted, fontSize:13, marginBottom:16 }}>
        タスク完了・記録更新・確認種の追加/削除・段階進行・文書更新・コメントを時系列で記録します（監査・引継ぎ用）。
      </div>
      {(project.activity||[]).length === 0
        ? <Card><div style={{ padding:"28px", textAlign:"center", color:C.textMuted, fontSize:14 }}>
            まだ記録がありません。作業を行うとここに履歴が残ります。
          </div></Card>
        : <Card style={{ padding:0, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead><tr style={{ background:C.bg }}>
                {["日時","担当者","操作"].map(h=><th key={h} style={{ padding:"10px 16px",
                  textAlign:"left", color:C.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace",
                  borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(project.activity||[]).map(a=>(
                  <tr key={a.id} style={{ borderBottom:`1px solid ${C.borderLight}` }}>
                    <td style={{ padding:"9px 16px", color:C.textMuted, whiteSpace:"nowrap",
                      fontFamily:"'DM Mono',monospace", fontSize:12 }}>{a.at}</td>
                    <td style={{ padding:"9px 16px", color:C.text, fontWeight:600, whiteSpace:"nowrap" }}>{a.by}</td>
                    <td style={{ padding:"9px 16px", color:C.textMid }}>{a.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>}
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
          <datalist id="rl-species">{RED_LIST_NAMES.map(n=><option key={n} value={n} />)}</datalist>
          {/* 種名：和名を入れると環境省レッドリストから学名・分類・カテゴリを自動補完 */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>
              種名（和名）*
              {newSp._rl && <span style={{ marginLeft:8, fontSize:12, color:C.primary, fontWeight:700 }}>
                ✓ レッドリストから自動補完
              </span>}
            </label>
            <input type="text" list="rl-species" value={newSp.name}
              placeholder="例）イヌワシ（入力すると自動補完されます）"
              onChange={e=>{
                const name = e.target.value;
                const hit = lookupSpecies(name);
                setNewSp(p => hit
                  ? { ...p, name, latin:hit.latin, type:hit.type, status:hit.status, protected:hit.protected, _rl:true }
                  : { ...p, name, _rl:false });
              }}
              style={{ ...INP, fontSize:14 }} />
          </div>
          {[
            { l:"学名",   k:"latin" },
            { l:"個体数", k:"count", t:"number" },
          ].map(f => <div key={f.k}>
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
          {/* 現場写真（カメラ起動対応・オフライン保存） */}
          <div style={{ gridColumn:"1/-1" }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14,
              fontWeight:700, marginBottom:7 }}>
              現場写真
              <span style={{ fontWeight:400, fontSize:12, color:C.textFaint, marginLeft:8 }}>
                オフラインでも保存され、接続回復後に自動アップロードされます
              </span>
            </label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              {(newSp.photos||[]).map((ph,pi)=>(
                <div key={ph.id} style={{ position:"relative" }}>
                  <img src={ph.url||ph.preview} alt={ph.name}
                    style={{ width:76, height:76, objectFit:"cover", borderRadius:8,
                      border:`2px solid ${ph.pending?C.amber:C.borderLight}` }}/>
                  {ph.pending && <span style={{ position:"absolute", bottom:2, left:2,
                    background:C.amberLight, color:C.amber, fontSize:9, fontWeight:700,
                    padding:"1px 4px", borderRadius:4 }}>⏳同期待ち</span>}
                  <button onClick={()=>setNewSp(p=>({...p,
                      photos:p.photos.filter((_,x)=>x!==pi)}))}
                    style={{ position:"absolute", top:-6, right:-6, width:20, height:20,
                      borderRadius:"50%", border:"none", background:C.red, color:"#fff",
                      fontSize:11, cursor:"pointer", lineHeight:1 }}>×</button>
                </div>
              ))}
              <label style={{ width:76, height:76, borderRadius:8, cursor:"pointer",
                border:`2px dashed ${C.border}`, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", color:C.textMuted, fontSize:11 }}>
                <span style={{ fontSize:20 }}>📷</span>撮影/追加
                <input type="file" accept="image/*" capture="environment" multiple
                  style={{ display:"none" }}
                  onChange={e=>{ addSpeciesPhotos(e.target.files); e.target.value=""; }}/>
              </label>
            </div>
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

// ── OFFLINE STATUS BAR ────────────────────────────────────────────────────────
function OfflineBar({ isOnline, pendingCount, syncing, onManualSync, syncError }) {
  // Only show when offline OR actively syncing OR has pending items
  if (isOnline && pendingCount === 0 && !syncing && !syncError) return null;
  const bg = !isOnline ? "#92400E" : syncing ? C.primary : "#B45309";
  return <>
  <div style={{
    position:"fixed", bottom:0, left:0, right:0, zIndex:999,
    background: bg, color:C.white, padding:"9px 20px",
    display:"flex", alignItems:"center", justifyContent:"space-between",
    fontSize:13, fontWeight:600, boxShadow:"0 -2px 12px #0003",
  }}>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ width:8, height:8, borderRadius:"50%",
        background: isOnline ? "#86EFAC" : "#FCA5A5",
        animation: syncing||!isOnline ? "pulse 1.5s infinite" : "none" }}/>
      {syncing
        ? `☁️ 同期中... (${pendingCount}件)`
        : !isOnline
          ? `📵 オフライン — ${pendingCount}件の変更をローカル保存中`
          : `⏳ 未同期 ${pendingCount}件 — Supabaseへの書き込みを待機中`
      }
    </div>
    {isOnline && !syncing && pendingCount > 0 && onManualSync && (
      <button onClick={onManualSync} style={{
        background:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.4)",
        color:C.white, borderRadius:6, padding:"4px 12px", cursor:"pointer",
        fontSize:12, fontWeight:700, fontFamily:"'Noto Sans JP',sans-serif",
      }}>今すぐ同期</button>
    )}
  </div>
  {syncError && <div style={{
    position:"fixed", bottom:48, left:0, right:0, zIndex:999,
    background:"#7F1D1D", color:"#FEE2E2", padding:"8px 20px",
    fontSize:12, display:"flex", justifyContent:"space-between", alignItems:"center"
  }}>
    <span>⚠️ 同期エラー: {syncError}</span>
  </div>}
  </>;
}

// ── TASK EDITOR MODAL ─────────────────────────────────────────────────────────
// Allows editing tasks for any stage, and saving as a named template.
// ── TEMPLATE BUILDER MODAL ────────────────────────────────────────────────────
// Full project template editor: customize stage names + tasks for all stages,
// then save as a reusable named template.
const STAGE_COLORS = ["#059669","#2563EB","#D97706","#7C3AED","#DB2777","#DC2626","#0891B2","#0F766E","#B45309","#6D28D9"];
const DEFAULT_TEMPLATE_STAGES = () => STAGES.map(s => ({
  ...s,
  tasks: [],
}));

function TemplateBuilderModal({ initial, onSave, onClose }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [name, setName]         = useState(initial?.name || "");
  const [desc, setDesc]         = useState(initial?.description || "");
  const [stages, setStages]     = useState(
    initial?.stages
      ? initial.stages.map(s => ({ ...s, tasks: (s.tasks||[]).map(t=>({...t})) }))
      : DEFAULT_TEMPLATE_STAGES()
  );
  const [activeStage, setActiveStage] = useState(0); // index into stages
  const [newTask, setNewTask]   = useState("");
  const [newStageLabel, setNewStageLabel] = useState("");
  const [saved, setSaved]       = useState(false);

  const stage = stages[activeStage];

  // ── stage operations ──────────────────────────────────────────────────────
  const updateStage = (idx, patch) =>
    setStages(ss => ss.map((s,i) => i===idx ? {...s,...patch} : s));

  const addStage = () => {
    if (!newStageLabel.trim()) return;
    const id = stages.length + 1;
    setStages(ss => [...ss, {
      id, short: newStageLabel.trim().slice(0,4),
      label: newStageLabel.trim(),
      color: STAGE_COLORS[ss.length % STAGE_COLORS.length],
      tasks: [],
    }]);
    setNewStageLabel("");
    setActiveStage(stages.length);
  };

  const removeStage = (idx) => {
    if (stages.length <= 1) return;
    const next = Math.min(activeStage, stages.length - 2);
    setStages(ss => ss.filter((_,i)=>i!==idx));
    setActiveStage(next);
  };

  const moveStage = (idx, dir) => {
    const arr = [...stages];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    setStages(arr);
    setActiveStage(t);
  };

  // ── task operations ───────────────────────────────────────────────────────
  const addTask = () => {
    if (!newTask.trim()) return;
    updateStage(activeStage, {
      tasks: [...(stage.tasks||[]), { id:`t_${Date.now()}`, label:newTask.trim(), done:false }]
    });
    setNewTask("");
  };

  const removeTask = (tid) =>
    updateStage(activeStage, { tasks: stage.tasks.filter(t=>t.id!==tid) });

  const moveTask = (idx, dir) => {
    const arr = [...stage.tasks];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    updateStage(activeStage, { tasks: arr });
  };

  const editTaskLabel = (tid, label) =>
    updateStage(activeStage, { tasks: stage.tasks.map(t => t.id===tid ? {...t,label} : t) });

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!name.trim()) return;
    // Renumber stage IDs sequentially
    const numbered = stages.map((s,i) => ({ ...s, id: i+1 }));
    onSave({
      id:    initial?.id || `tmpl_${Date.now()}`,
      name:  name.trim(),
      description: desc.trim(),
      stages: numbered,
      createdAt: initial?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setSaved(true);
    setTimeout(onClose, 700);
  };

  const totalTasks = stages.reduce((n,s)=>n+(s.tasks||[]).length, 0);

  return <div style={{ position:"fixed", inset:0, background:"#00000088",
    display:"flex", alignItems:isMobile?"flex-end":"center",
    justifyContent:"center", zIndex:700 }}>
    <div style={{ background:C.surface,
      borderRadius: isMobile ? "16px 16px 0 0" : 16,
      width: isMobile ? "100vw" : "min(820px, 96vw)",
      height: isMobile ? "92vh" : "85vh",
      display:"flex", flexDirection:"column", boxShadow:C.shadowMd, overflow:"hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding:"18px 24px", borderBottom:`1px solid ${C.borderLight}`,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        background:`linear-gradient(135deg,${C.primary}0D,${C.surface})` }}>
        <div>
          <h2 style={{ color:C.text, fontSize:17, fontWeight:700,
            fontFamily:"'Noto Serif JP',serif", marginBottom:3 }}>
            {initial ? "テンプレートを編集" : "新規テンプレートを作成"}
          </h2>
          <div style={{ color:C.textMuted, fontSize:12 }}>
            {stages.length}段階 · {totalTasks}タスク合計
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={onClose}>✕</Btn>
      </div>

      {/* ── Template name / desc ── */}
      <div style={{ padding:"14px 24px", borderBottom:`1px solid ${C.borderLight}`,
        display:"flex", gap:12, flexWrap:"wrap" }}>
        <div style={{ flex:2, minWidth:180 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:12,
            fontWeight:700, marginBottom:5 }}>テンプレート名 *</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder="例：河川生態系調査（標準）"
            style={{ ...INP, fontSize:13, width:"100%" }} />
        </div>
        <div style={{ flex:3, minWidth:200 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:12,
            fontWeight:700, marginBottom:5 }}>説明（任意）</label>
          <input value={desc} onChange={e=>setDesc(e.target.value)}
            placeholder="このテンプレートの用途や特徴"
            style={{ ...INP, fontSize:13, width:"100%" }} />
        </div>
      </div>

      {/* ── Main body: stage list (left) + task editor (right) ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

        {/* Left: stage list */}
        <div style={{ width: isMobile ? "100%" : 220, borderRight:`1px solid ${C.borderLight}`,
          display:"flex", flexDirection:"column", background:C.bg,
          ...(isMobile ? { display: activeStage === null ? "flex" : "none" } : {}) }}>
          <div style={{ padding:"10px 12px", borderBottom:`1px solid ${C.borderLight}`,
            color:C.textMuted, fontSize:11, fontWeight:700,
            fontFamily:"'DM Mono',monospace", letterSpacing:"0.06em" }}>
            段階一覧
          </div>
          <div style={{ flex:1, overflowY:"auto" }}>
            {stages.map((s, idx) => (
              <div key={idx} onClick={()=>setActiveStage(idx)}
                style={{ padding:"10px 12px", cursor:"pointer",
                  background: activeStage===idx ? C.surface : "transparent",
                  borderLeft:`3px solid ${activeStage===idx ? s.color : "transparent"}`,
                  borderBottom:`1px solid ${C.borderLight}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%",
                    background:s.color, flexShrink:0 }}/>
                  <span style={{ color:activeStage===idx?C.text:C.textMid,
                    fontSize:13, fontWeight:activeStage===idx?700:400,
                    flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {s.label||"（名前未設定）"}
                  </span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"center", paddingLeft:14 }}>
                  <span style={{ color:C.textFaint, fontSize:11 }}>
                    {(s.tasks||[]).length}タスク
                  </span>
                  <div style={{ display:"flex", gap:2 }}>
                    <button onClick={e=>{e.stopPropagation();moveStage(idx,-1);}}
                      disabled={idx===0}
                      style={{ background:"none", border:"none", cursor:"pointer",
                        color:idx===0?C.textFaint:C.textMuted, fontSize:10, padding:"1px 3px" }}>▲</button>
                    <button onClick={e=>{e.stopPropagation();moveStage(idx,1);}}
                      disabled={idx===stages.length-1}
                      style={{ background:"none", border:"none", cursor:"pointer",
                        color:idx===stages.length-1?C.textFaint:C.textMuted, fontSize:10, padding:"1px 3px" }}>▼</button>
                    <button onClick={e=>{e.stopPropagation();removeStage(idx);}}
                      disabled={stages.length<=1}
                      style={{ background:"none", border:"none", cursor:"pointer",
                        color:stages.length<=1?C.textFaint:C.red, fontSize:12, padding:"1px 4px" }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Add stage */}
          <div style={{ padding:"10px 12px", borderTop:`1px solid ${C.borderLight}` }}>
            <div style={{ display:"flex", gap:6 }}>
              <input value={newStageLabel} onChange={e=>setNewStageLabel(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addStage()}
                placeholder="段階名を追加..."
                style={{ ...INP, flex:1, fontSize:12, padding:"6px 8px" }} />
              <Btn size="sm" onClick={addStage} disabled={!newStageLabel.trim()}>＋</Btn>
            </div>
          </div>
        </div>

        {/* Right: task editor for selected stage */}
        {stage && <div style={{ flex:1, display:"flex", flexDirection:"column",
          overflow:"hidden", minWidth:0 }}>

          {/* Stage header — editable */}
          <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.borderLight}`,
            background:`${stage.color}09` }}>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              {/* Color picker */}
              <input type="color" value={stage.color}
                onChange={e=>updateStage(activeStage,{color:e.target.value})}
                style={{ width:28, height:28, border:"none", borderRadius:6,
                  cursor:"pointer", padding:2 }} />
              <div style={{ flex:1, minWidth:120 }}>
                <input value={stage.label}
                  onChange={e=>updateStage(activeStage,{label:e.target.value, short:e.target.value.slice(0,5)})}
                  placeholder="段階名..."
                  style={{ ...INP, fontSize:14, fontWeight:700, width:"100%",
                    background:"transparent", border:`1px solid ${stage.color}44` }} />
              </div>
              <div style={{ width: isMobile ? "100%" : 100 }}>
                <input value={stage.short}
                  onChange={e=>updateStage(activeStage,{short:e.target.value.slice(0,6)})}
                  placeholder="略称"
                  style={{ ...INP, fontSize:12, width:"100%",
                    background:"transparent", border:`1px solid ${stage.color}44` }} />
              </div>
            </div>
          </div>

          {/* Task list */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px 18px" }}>
            {(stage.tasks||[]).length === 0 && (
              <div style={{ color:C.textFaint, fontSize:13, textAlign:"center",
                padding:"28px 0" }}>
                タスクなし。下から追加してください。
              </div>
            )}
            {(stage.tasks||[]).map((task, idx) => (
              <div key={task.id}
                style={{ display:"flex", alignItems:"center", gap:8,
                  padding:"8px 10px", background:C.bg, borderRadius:8,
                  marginBottom:6, border:`1px solid ${C.borderLight}` }}>
                <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                  <button onClick={()=>moveTask(idx,-1)} disabled={idx===0}
                    style={{ background:"none", border:"none", cursor:"pointer",
                      color:idx===0?C.textFaint:C.textMuted, fontSize:10, padding:"1px 3px" }}>▲</button>
                  <button onClick={()=>moveTask(idx,1)} disabled={idx===(stage.tasks.length-1)}
                    style={{ background:"none", border:"none", cursor:"pointer",
                      color:idx===stage.tasks.length-1?C.textFaint:C.textMuted, fontSize:10, padding:"1px 3px" }}>▼</button>
                </div>
                <span style={{ color:C.textFaint, fontSize:11,
                  fontFamily:"'DM Mono',monospace", width:18, textAlign:"right",
                  flexShrink:0 }}>{idx+1}</span>
                <input value={task.label}
                  onChange={e=>editTaskLabel(task.id, e.target.value)}
                  style={{ flex:1, background:"transparent", border:"none",
                    borderBottom:`1px solid ${C.borderLight}`,
                    color:C.text, fontSize:13, padding:"3px 4px",
                    fontFamily:"'Noto Sans JP',sans-serif",
                    outline:"none" }}
                  onFocus={e=>e.target.style.borderBottomColor=C.primary}
                  onBlur={e=>e.target.style.borderBottomColor=C.borderLight}
                />
                <button onClick={()=>removeTask(task.id)}
                  style={{ background:"none", border:"none", cursor:"pointer",
                    color:C.textMuted, fontSize:14, padding:"2px 5px",
                    borderRadius:4, flexShrink:0 }}
                  onMouseEnter={e=>e.currentTarget.style.color=C.red}
                  onMouseLeave={e=>e.currentTarget.style.color=C.textMuted}>✕</button>
              </div>
            ))}
            {/* Add task */}
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <input value={newTask} onChange={e=>setNewTask(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addTask()}
                placeholder="タスクを追加..."
                style={{ ...INP, flex:1, fontSize:13 }} />
              <Btn size="sm" onClick={addTask} disabled={!newTask.trim()}>追加</Btn>
            </div>
          </div>
        </div>}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding:"14px 24px", borderTop:`1px solid ${C.borderLight}`,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        background:C.bg, flexWrap:"wrap", gap:10 }}>
        <div style={{ color:C.textMuted, fontSize:12 }}>
          {stages.length}段階 · {totalTasks}タスク · 全段階の内容は後からプロジェクト内で編集可能
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Btn variant="ghost" onClick={onClose}>キャンセル</Btn>
          <Btn onClick={handleSave} disabled={!name.trim()}>
            {saved ? "✓ 保存しました" : "💾 テンプレートを保存"}
          </Btn>
        </div>
      </div>
    </div>
  </div>;
}

// ── TEMPLATE MANAGER ──────────────────────────────────────────────────────────
// Shown in NewProjectModal — lists built-in + saved templates, allows editing
function TemplateManager({ savedTemplates, onSelect, onEdit, onDelete, onNew, selected }) {
  const [tab, setTab] = useState("builtin");
  return <div>
    <div style={{ display:"flex", gap:0, marginBottom:14,
      border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
      {[["builtin","📋 標準テンプレート"],["saved",`💾 保存済み (${savedTemplates.length})`]].map(([k,v])=>(
        <button key={k} onClick={()=>setTab(k)} style={{
          flex:1, padding:"9px", background:tab===k?C.primary:C.surface,
          border:"none", color:tab===k?C.white:C.textMuted, cursor:"pointer",
          fontSize:13, fontWeight:tab===k?700:400,
          fontFamily:"'Noto Sans JP',sans-serif" }}>{v}</button>
      ))}
    </div>

    {tab==="builtin" && <div style={{ display:"grid",
      gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
      {SURVEY_TYPES.filter(t=>t.id!=="custom").map(t=>{
        const sel = selected?.type==="builtin" && selected?.id===t.id;
        return <div key={t.id} onClick={()=>onSelect({type:"builtin",id:t.id})}
          style={{ padding:"12px 14px", borderRadius:10, cursor:"pointer",
            border:`2px solid ${sel?t.color:C.borderLight}`,
            background:sel?`${t.color}11`:C.surface,
            display:"flex", flexDirection:"column", gap:6 }}>
          <span style={{ fontSize:22 }}>{t.icon}</span>
          <span style={{ color:sel?t.color:C.text, fontSize:13, fontWeight:sel?700:400,
            lineHeight:1.3 }}>{t.label}</span>
          <span style={{ color:C.textFaint, fontSize:11 }}>7段階 · 標準タスク</span>
        </div>;
      })}
    </div>}

    {tab==="saved" && <>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:10 }}>
        <Btn size="sm" icon="＋" onClick={onNew}>新規テンプレートを作成</Btn>
      </div>
      {savedTemplates.length === 0
        ? <div style={{ color:C.textFaint, fontSize:13, textAlign:"center",
            padding:"28px 0", background:C.bg, borderRadius:10 }}>
            保存済みテンプレートはありません。<br/>
            「新規テンプレートを作成」から作成できます。
          </div>
        : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {savedTemplates.map(t=>{
              const sel = selected?.type==="saved" && selected?.id===t.id;
              return <div key={t.id}
                style={{ padding:"12px 16px", borderRadius:10,
                  border:`2px solid ${sel?C.primary:C.borderLight}`,
                  background:sel?C.light:C.surface }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", gap:8 }}>
                  <div style={{ flex:1, cursor:"pointer" }} onClick={()=>onSelect({type:"saved",id:t.id})}>
                    <div style={{ color:C.text, fontSize:14, fontWeight:700 }}>{t.name}</div>
                    {t.description && <div style={{ color:C.textMuted, fontSize:12,
                      marginTop:2 }}>{t.description}</div>}
                    <div style={{ color:C.textFaint, fontSize:11, marginTop:4,
                      fontFamily:"'DM Mono',monospace" }}>
                      {t.stages?.length||0}段階 · {t.stages?.reduce((n,s)=>n+(s.tasks?.length||0),0)||0}タスク合計
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    <Btn variant="ghost" size="sm" onClick={()=>onEdit(t)}>編集</Btn>
                    <Btn variant="danger" size="sm" onClick={()=>{
                      if(window.confirm(`「${t.name}」を削除しますか？`)) onDelete(t.id);
                    }}>削除</Btn>
                  </div>
                </div>
                {sel && t.stages && <div style={{ marginTop:10, display:"flex",
                  gap:6, flexWrap:"wrap" }}>
                  {t.stages.map(s=>(
                    <div key={s.id} style={{ padding:"3px 8px", borderRadius:20,
                      background:`${s.color}18`, border:`1px solid ${s.color}44`,
                      fontSize:11, color:s.color, fontWeight:600 }}>
                      {s.short||s.label} ({(s.tasks||[]).length})
                    </div>
                  ))}
                </div>}
              </div>;
            })}
          </div>
      }
    </>}
  </div>;
}


function NewProjectModal({ onSave, onCancel, savedTemplates=[], onSaveTemplate, onDeleteTemplate }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [step, setStep] = useState(1); // 1=info, 2=template
  const [d, setD] = useState({
    name:"", client:"", type:"wind", pref:"東京都",
    deadline:"2027-03-31", area:"", budget:"",
    desc:"", manager:"", risk:"low",
    projectClass:"1",  // 第一種・第二種・条例のみ
    juranDates:{},     // { stageId: "YYYY-MM-DD" } 縦覧開始日
  });
  const f = k => e => setD(p => ({...p,[k]:e.target.value}));

  // Selected template: { type:"builtin"|"saved", id }
  const [selectedTmpl, setSelectedTmpl] = useState({ type:"builtin", id:TYPE_TO_TEMPLATE.wind });
  const [tmplTouched, setTmplTouched] = useState(false); // 手動選択後は自動推奨を停止
  // For building/editing a template inline
  const [buildingTemplate, setBuildingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const resolveStages = () => {
    if (selectedTmpl.type === "saved") {
      const t = savedTemplates.find(t => t.id === selectedTmpl.id);
      return t?.stages || DEFAULT_TEMPLATE_STAGES();
    }
    // builtin
    const base = TEMPLATE_TASKS[selectedTmpl.id] || TEMPLATE_TASKS.bio;
    return STAGES.map(s => ({
      ...s,
      tasks: (base[s.id]||[]).map((label,i) => ({
        id:`bi_${s.id}_${i}`, label, done:false
      }))
    }));
  };

  const handleCreate = () => {
    const stages = resolveStages();
    const tasksObj = {};
    stages.forEach(s => { tasksObj[s.id] = s.tasks; });
    onSave({
      ...d, id: Date.now(), stage: stages[0]?.id || 1,
      customStages: stages,
      tasks: tasksObj,
      species:[], redListCount:0, progress:0,
      comments:[], documents:[],
    });
  };

  if (buildingTemplate) return <TemplateBuilderModal
    initial={editingTemplate}
    onSave={t => { onSaveTemplate(t); setBuildingTemplate(false); setEditingTemplate(null); setSelectedTmpl({type:"saved",id:t.id}); }}
    onClose={() => { setBuildingTemplate(false); setEditingTemplate(null); }}
  />;

  return <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
    zIndex:500, display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center" }}>
    <div style={{ background:C.surface,
      borderRadius: isMobile ? "16px 16px 0 0" : 16,
      width: isMobile ? "100vw" : "min(620px,96vw)",
      maxHeight: isMobile ? "92vh" : "90vh",
      overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)",
      display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <div style={{ padding:"22px 28px 16px", borderBottom:`1px solid ${C.borderLight}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h2 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
            fontSize:20, fontWeight:700 }}>新規プロジェクトを作成</h2>
          <Btn variant="ghost" size="sm" onClick={onCancel}>✕</Btn>
        </div>
        {/* Step indicator */}
        <div style={{ display:"flex", gap:0 }}>
          {[["1","基本情報"],["2","タスクテンプレート"]].map(([n,l],i)=>(
            <div key={n} onClick={()=>{ if(i===1&&!d.name.trim()) return; setStep(i+1); }}
              style={{ display:"flex", alignItems:"center", gap:8, flex:1,
                cursor: i===0||(d.name.trim()&&d.client.trim()) ? "pointer" : "default",
                opacity: i===1 && !d.name.trim() ? 0.4 : 1 }}>
              <div style={{ width:24, height:24, borderRadius:"50%",
                background: step===i+1 ? C.primary : step>i+1 ? C.mid : C.bg,
                border:`2px solid ${step===i+1?C.primary:step>i+1?C.mid:C.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:11, fontWeight:700,
                color: step===i+1||step>i+1 ? C.white : C.textMuted }}>
                {step>i+1 ? "✓" : n}
              </div>
              <span style={{ fontSize:13, color:step===i+1?C.primary:C.textMuted,
                fontWeight:step===i+1?700:400 }}>{l}</span>
              {i<1 && <div style={{ flex:1, height:2,
                background: step>1 ? C.mid : C.borderLight, margin:"0 8px" }}/>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"22px 28px" }}>

        {/* ── Step 1: Project info ── */}
        {step===1 && <>
          <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr",
            gap:14, marginBottom:16 }}>
            {[
              { l:"プロジェクト名 *", k:"name", span:true, ph:"例：○○山系太陽光発電EIA" },
              { l:"クライアント名 *", k:"client", ph:"例：○○株式会社" },
              { l:"担当者",          k:"manager", ph:"例：山田 太郎" },
            ].map(fi => <div key={fi.k} style={{ gridColumn:fi.span?"1/-1":"auto" }}>
              <label style={{ display:"block", color:C.textMid, fontSize:14,
                fontWeight:700, marginBottom:7 }}>{fi.l}</label>
              <input value={d[fi.k]} onChange={f(fi.k)} placeholder={fi.ph||""}
                style={{ ...INP, fontSize:14 }} />
            </div>)}
            <div>
              <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>事業種別 *</label>
              <select value={d.type} onChange={e=>{
                  const v = e.target.value;
                  setD(p=>({...p, type:v}));
                  // 技術指針の重点項目に基づき推奨テンプレートを自動選択
                  // （ユーザーが手動でテンプレートを選んだ後は上書きしない）
                  if(!tmplTouched) setSelectedTmpl({ type:"builtin", id:TYPE_TO_TEMPLATE[v]||"bio" });
                }} style={{ ...INP, fontSize:14 }}>
                {Object.entries(ALL_PROJECT_TYPES.reduce((acc,t)=>{
                  acc[t.g]=acc[t.g]||[];acc[t.g].push(t);return acc;},{}))
                  .map(([grp,types])=><optgroup key={grp} label={grp}>
                    {types.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
                  </optgroup>)}
              </select>
            </div>
            <div>
              <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>都道府県 *</label>
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
              <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>事業面積 (ha)</label>
              <input value={d.area} onChange={f("area")} placeholder="例：500" style={{ ...INP, fontSize:14 }} />
            </div>
            <div>
              <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>提出期限</label>
              <input type="date" value={d.deadline} onChange={f("deadline")} style={{ ...INP, fontSize:14 }} />
            </div>
            <div>
              <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>リスクレベル</label>
              <select value={d.risk} onChange={f("risk")} style={{ ...INP, fontSize:14 }}>
                <option value="low">低リスク</option>
                <option value="medium">中リスク</option>
                <option value="high">高リスク</option>
              </select>
            </div>
            <div>
              <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>予算（円）</label>
              <input value={d.budget} onChange={f("budget")} placeholder="例：5000000" style={{ ...INP, fontSize:14 }} />
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>
                事業区分（環境影響評価法施行令）
              </label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                {[["1","第一種事業（EIA必須）"],["2","第二種事業（スクリーニング）"],["ordinance","条例アセスのみ"]].map(([v,l])=>(
                  <label key={v} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                    padding:"7px 14px", borderRadius:8,
                    border:`2px solid ${d.projectClass===v?C.primary:C.borderLight}`,
                    background:d.projectClass===v?C.light:"transparent",
                    fontSize:13, fontWeight:d.projectClass===v?700:400 }}>
                    <input type="radio" name="projectClass" value={v}
                      checked={d.projectClass===v}
                      onChange={()=>setD(p=>({...p,projectClass:v}))}
                      style={{ accentColor:C.primary }} />
                    {l}
                  </label>
                ))}
              </div>
              {PROJECT_CLASS_THRESHOLDS[d.type] && (
                <div style={{ background:C.bg, border:`1px solid ${C.borderLight}`,
                  borderRadius:8, padding:"8px 12px", fontSize:12, color:C.textMuted }}>
                  <span style={{ fontWeight:700, color:C.textMid }}>参考規模区分：</span>
                  {" "}第一種：{PROJECT_CLASS_THRESHOLDS[d.type].class1}
                  {" ／ "}第二種：{PROJECT_CLASS_THRESHOLDS[d.type].class2}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>事業概要</label>
            <textarea value={d.desc} onChange={f("desc")} rows={3}
              placeholder="事業の目的・場所・規模などを簡潔に記入してください"
              style={{ ...INP, fontSize:14, resize:"vertical" }} />
          </div>
          <Btn fullWidth size="lg"
            disabled={!d.name.trim()||!d.client.trim()}
            onClick={()=>setStep(2)}>
            次へ：タスクテンプレートを選ぶ →
          </Btn>
        </>}

        {/* ── Step 2: Template picker ── */}
        {step===2 && <>
          <p style={{ color:C.textMuted, fontSize:13, marginBottom:10 }}>
            プロジェクトの各段階で使うタスクのテンプレートを選んでください。
            標準テンプレートは自動で設定されます。保存済みテンプレートを使うか、新規作成も可能です。
          </p>
          {!tmplTouched && <div style={{ marginBottom:14, padding:"9px 13px",
            background:C.light, border:`1px solid ${C.primary}33`, borderRadius:8,
            fontSize:12.5, color:C.primary }}>
            ✓ 事業種「{ALL_PROJECT_TYPES.find(t=>t.v===d.type)?.l||d.type}」の重点項目に基づき
            「{SURVEY_TYPES.find(s=>s.id===selectedTmpl.id)?.label||selectedTmpl.id}」テンプレートを推奨選択しています
          </div>}
          <TemplateManager
            savedTemplates={savedTemplates}
            selected={selectedTmpl}
            onSelect={(t)=>{ setSelectedTmpl(t); setTmplTouched(true); }}
            onNew={()=>{ setEditingTemplate(null); setBuildingTemplate(true); }}
            onEdit={t=>{ setEditingTemplate(t); setBuildingTemplate(true); }}
            onDelete={onDeleteTemplate}
          />
          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <Btn variant="ghost" onClick={()=>setStep(1)}>← 戻る</Btn>
            <Btn fullWidth size="lg" onClick={handleCreate}>
              ✓ プロジェクトを作成する
            </Btn>
          </div>
        </>}
      </div>
    </div>
  </div>;
}



// ─── SCOPING MODULE ───────────────────────────────────────────────────────────
function ScopingModule() {
  const [pType,setPType]=useState("power");
  const [subtype,setSubtype]=useState("wind");
  const [pref,setPref]=useState("北海道");
  const [done,setDone]=useState(false);

  const typeObj = EIA.LEGAL_TYPE_BY_KEY[pType];
  const hasSubtypes = !!typeObj?.subtypes;
  const itemKeys = EIA.selectedItemsFor(pType, hasSubtypes ? subtype : undefined);
  const grouped = EIA.itemsByCategory(itemKeys);
  // 選定項目のうち、厳密な調査手法（技術規格）が定義されているもの
  const surveyRows = itemKeys
    .map(k => ({ item: EIA.ENV_ITEM_BY_KEY[k], method: EIA.SURVEY_METHODS[EIA.ENV_ITEM_BY_KEY[k]?.survey] }))
    .filter(r => r.method);
  const focusText = hasSubtypes
    ? typeObj.subtypes.find(s=>s.key===subtype)?.focus
    : typeObj?.focus;

  const sectionTitle = { fontFamily:"'Noto Serif JP',serif", fontSize:17, fontWeight:700,
    color:C.text, margin:"26px 0 12px" };

  return <div>
    <h1 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
      fontSize:28, fontWeight:700, margin:"0 0 6px" }}>スコーピング・調査設計</h1>
    <p style={{ color:C.textMuted, fontSize:14, marginBottom:28 }}>
      法定13対象事業・環境影響評価法・技術指針に基づき、法定手続・項目選定・調査手法を自動生成します
    </p>
    <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:24 }}>
      <Card style={{ height:"fit-content" }}>
        <SLabel>事業条件を入力</SLabel>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>法定対象事業</label>
          <select value={pType} onChange={e=>{setPType(e.target.value);setDone(false);}} style={{ ...INP,fontSize:14,width:"100%" }}>
            {Object.entries(EIA.LEGAL_PROJECT_TYPES.reduce((a,t)=>{a[t.group]=a[t.group]||[];a[t.group].push(t);return a;},{}))
              .map(([grp,types])=><optgroup key={grp} label={grp}>
                {types.map(t=><option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}</optgroup>)}
          </select>
        </div>
        {hasSubtypes && <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>発電種別</label>
          <select value={subtype} onChange={e=>{setSubtype(e.target.value);setDone(false);}} style={{ ...INP,fontSize:14,width:"100%" }}>
            {typeObj.subtypes.map(s=><option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
          </select>
        </div>}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>都道府県</label>
          <select value={pref} onChange={e=>setPref(e.target.value)} style={{ ...INP,fontSize:14,width:"100%" }}>
            {["北海道","青森県","東京都","神奈川県","長野県","愛知県","大阪府","広島県","福岡県","沖縄県"].map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        {focusText && <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8,
          padding:"10px 12px", fontSize:12, color:C.textMid, marginBottom:16 }}>
          <strong style={{ color:C.text }}>重点項目：</strong>{focusText}
        </div>}
        <Btn fullWidth onClick={()=>setDone(true)} size="lg">調査計画を自動生成 →</Btn>
      </Card>

      {done ? <div>
        <div style={{ background:C.light, border:`1px solid ${C.primary}44`, borderRadius:12,
          padding:"13px 18px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20 }}>✅</span>
          <div style={{ flex:1 }}>
            <div style={{ color:C.primary, fontSize:14, fontWeight:700 }}>
              {typeObj.label}{hasSubtypes?`（${typeObj.subtypes.find(s=>s.key===subtype)?.label}）`:""} の調査計画を生成しました
            </div>
            <div style={{ color:C.textMuted, fontSize:13 }}>環境影響評価法・技術指針 + {pref}版レッドリスト(RDB)に基づき自動選定</div>
          </div>
        </div>

        {/* 法定手続タイムライン */}
        <div style={sectionTitle}>① 法定手続スケジュール（順序変更・省略は法律上不可）</div>
        <Card style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr style={{ background:C.bg }}>
              {["段階","根拠条文","公告縦覧","住民説明会","知事意見期限"].map(h=><th key={h} style={{ padding:"10px 14px",
                textAlign:"left", color:C.textMuted, fontSize:11, fontFamily:"'DM Mono',monospace", borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
            </tr></thead>
            <tbody>{EIA.PROCEDURE_STAGES.map(s=>(
              <tr key={s.id} style={{ borderBottom:`1px solid ${C.borderLight}` }}>
                <td style={{ padding:"10px 14px" }}><Chip color="#fff" bg={s.color}>{s.short}</Chip>
                  <span style={{ color:C.textMid, marginLeft:8 }}>{s.name}</span></td>
                <td style={{ padding:"10px 14px", color:C.textMuted }}>{s.article}</td>
                <td style={{ padding:"10px 14px", color:C.text }}>{s.juranDays?`${s.juranDays}日`:"—"}</td>
                <td style={{ padding:"10px 14px" }}>{s.explanation?<Chip color={C.amber} bg={C.amberLight}>必須</Chip>:<span style={{color:C.textFaint}}>—</span>}</td>
                <td style={{ padding:"10px 14px", color:C.text }}>{s.governorOpinionDays?`縦覧満了+${s.governorOpinionDays}日`:"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>

        {/* 項目選定マトリクス（4区分） */}
        <div style={sectionTitle}>② 環境影響評価項目の選定（技術指針 環境4区分）</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
          {Object.values(EIA.ENV_CATEGORIES).map(cat=>{
            const items = grouped[cat.key];
            return <Card key={cat.key}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <span style={{ width:10, height:10, borderRadius:3, background:cat.color }}/>
                <span style={{ fontWeight:700, color:C.text, fontSize:14 }}>{cat.label}</span>
                <span style={{ color:C.textFaint, fontSize:12 }}>{items.length}項目</span>
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {items.length ? items.map(it=><Chip key={it.key} color={cat.color} bg={cat.color+"18"}>{it.label}</Chip>)
                  : <span style={{ color:C.textFaint, fontSize:12 }}>選定なし</span>}
              </div>
            </Card>;
          })}
        </div>

        {/* 調査手法の技術仕様 */}
        <div style={sectionTitle}>③ 調査手法の技術仕様（項目別・法定規格）</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {surveyRows.map(({item,method})=>(
            <Card key={item.key}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:6 }}>
                <span style={{ fontWeight:700, color:C.text, fontSize:15 }}>{item.label}</span>
                <Chip color={C.primary} bg={C.light}>{method.method}</Chip>
                {method.standard && <Chip color={C.textMuted} bg={C.bg}>規格: {method.standard}</Chip>}
                {method.seasons?.length ? <Chip color={C.amber} bg={C.amberLight}>{method.seasons.join("・")}（四季）</Chip> : null}
              </div>
              <div style={{ color:C.textMid, fontSize:13, lineHeight:1.7 }}>{method.spec}</div>
            </Card>
          ))}
        </div>
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
function ReportModule({ projects=[] }) {
  const [projectId,setProjectId]=useState("");
  const [kind,setKind]=useState("hoho"); // hoho | junbi
  const kindLabel = kind==="junbi" ? "準備書" : "方法書";
  // 案件は非同期で読み込まれるため、未選択/不一致なら先頭案件にフォールバック
  const selectedId = (projectId && projects.some(p=>String(p.id)===String(projectId)))
    ? projectId : (projects[0]?.id ?? "");
  const project = projects.find(p=>String(p.id)===String(selectedId));
  const html = project ? EIA.buildDocument(kind, project) : "";

  function printDoc(){
    if(!html) return;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open(); d.write(html); d.close();
    let printed = false;
    const doPrint = ()=>{ if(printed) return; printed=true;
      try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){}
      setTimeout(()=>{ try{ document.body.removeChild(f); }catch(e){} }, 3000); };
    f.onload = ()=> setTimeout(doPrint, 250);
    setTimeout(doPrint, 900); // フォールバック（onload未発火時）
  }
  function downloadDoc(){
    if(!html) return;
    const blob = new Blob(["﻿", html], { type:"application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kindLabel}_${(project?.name||"案件").replace(/[\\/:*?"<>|]/g,"_")}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  }

  const speciesCount = project?.species?.length || 0;
  const rlCount = (project?.species||[]).filter(s=>["CR","EN","VU","NT"].includes(s.status)).length;

  return <div>
    <h1 style={{ color:C.text, fontFamily:"'Noto Serif JP',serif",
      fontSize:28, fontWeight:700, margin:"0 0 6px" }}>法定図書の生成</h1>
    <p style={{ color:C.textMuted, fontSize:14, marginBottom:28 }}>
      案件データから、主務省令の章建て構成に沿った方法書・準備書の草案を生成します（下に実物プレビュー・PDF印刷・Word保存対応）
    </p>

    <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:24 }}>
      <Card style={{ height:"fit-content" }}>
        <SLabel>出力設定</SLabel>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>対象案件</label>
          <select value={selectedId} onChange={e=>setProjectId(e.target.value)} style={{ ...INP, fontSize:14, width:"100%" }}>
            {projects.length===0 && <option value="">案件がありません</option>}
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:18 }}>
          <label style={{ display:"block", color:C.textMid, fontSize:14, fontWeight:700, marginBottom:7 }}>図書種別</label>
          <div style={{ display:"flex", gap:8 }}>
            {[{k:"hoho",l:"方法書"},{k:"junbi",l:"準備書"}].map(o=>(
              <button key={o.k} onClick={()=>setKind(o.k)} style={{ flex:1, padding:"10px",
                borderRadius:8, border:`2px solid ${kind===o.k?C.primary:C.border}`,
                background:kind===o.k?C.light:C.surface, color:kind===o.k?C.primary:C.textMuted,
                fontWeight:700, fontSize:14, cursor:"pointer" }}>{o.l}</button>
            ))}
          </div>
        </div>
        {project ? <>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
            <Chip color={C.primary} bg={C.light}>確認種 {speciesCount}件</Chip>
            <Chip color={C.red} bg={C.redLight}>重要種 {rlCount}件</Chip>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Btn fullWidth size="lg" icon="🖨️" onClick={printDoc}>印刷 / PDFで保存</Btn>
            <Btn fullWidth size="lg" variant="secondary" icon="⬇️" onClick={downloadDoc}>Word (.doc) をダウンロード</Btn>
          </div>
          <div style={{ marginTop:16, fontSize:12, color:C.textMuted, lineHeight:1.7 }}>
            「印刷」→ 印刷ダイアログで「PDFに保存」を選ぶとPDF化できます。
          </div>
        </> : <div style={{ fontSize:13, color:C.textMuted, lineHeight:1.8 }}>
          案件がありません。まず案件を作成してください。
        </div>}
      </Card>

      {project ? <Card style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center", background:C.bg }}>
          <span style={{ fontWeight:700, color:C.text, fontSize:14 }}>実物プレビュー — {kindLabel}</span>
          <span style={{ fontSize:12, color:C.textMuted }}>{project.name}</span>
        </div>
        <iframe title="report-preview" srcDoc={html}
          style={{ width:"100%", height:640, border:"none", background:"#fff" }}/>
      </Card> : <div style={{ background:C.surface, border:`2px dashed ${C.border}`,
        borderRadius:14, padding:64, textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:14 }}>📄</div>
        <div style={{ color:C.textMuted, fontSize:15 }}>案件を作成すると、ここに図書のプレビューが表示されます</div>
      </div>}
    </div>
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
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
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
    display:"flex", alignItems:isMobile?"flex-end":"center", justifyContent:"center", zIndex:500 }}>
    <div style={{ background:C.surface, borderRadius: isMobile?"16px 16px 0 0":16, width:isMobile?"100vw":"min(480px,95vw)",
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

function AccountModule({ org, currentUser, members=[], onUpdateRole, projectCount=0 }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [tab,setTab]=useState("team");
  const [inviting,setInviting]=useState(false);
  const isAdmin = ["admin","pm"].includes(currentUser?.role);
  const canEditRoles = currentUser?.role === "admin"; // 役割変更は管理者のみ（RLS準拠）
  const plan = PLANS[org?.plan||"starter"];
  const memberCount = members.length;
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
              {memberCount}名 · {projectCount}件
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
        <div style={{ fontSize:12, color:C.textMid, lineHeight:1.7, marginBottom:14,
          background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px" }}>
          ℹ️ 招待するとメンバーにメールが届きます。相手が初回ログインすると、この組織の一員として自動的に一覧へ表示され、以降は役割をここで変更できます。
        </div>
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
            {memberCount===0 && <tr><td colSpan={6} style={{ padding:"28px 18px",
              textAlign:"center", color:C.textMuted, fontSize:13 }}>
              メンバーはまだ登録されていません（初回ログイン時に自動でここに表示されます）
            </td></tr>}
            {members.map(m=>{const r=ROLE_CFG[m.role]||ROLE_CFG.surveyor;return <tr key={m.id}
              style={{ borderBottom:`1px solid ${C.borderLight}` }}>
              <td style={{ padding:"12px 18px" }}>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ width:34,height:34,borderRadius:"50%",
                    background:`linear-gradient(135deg,${C.primary},${C.blue})`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    color:C.white,fontWeight:700,fontSize:14,flexShrink:0 }}>{(m.name||"?")[0]}</div>
                  <span style={{ color:C.text,fontSize:14,fontWeight:600 }}>{m.name}
                    {m.self && <span style={{ color:C.textFaint,fontSize:12,fontWeight:400,marginLeft:6 }}>（あなた）</span>}
                  </span>
                </div>
              </td>
              <td style={{ padding:"12px 18px",color:C.textMuted,fontSize:13 }}>{m.email||"—"}</td>
              <td style={{ padding:"12px 18px" }}>
                {canEditRoles && !m.self
                  ? <select value={m.role} onChange={e=>onUpdateRole?.(m.id, e.target.value)}
                      style={{ ...INP, padding:"6px 10px", fontSize:13 }}>
                      {Object.entries(ROLE_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  : <Chip color={r.color} bg={r.badge}>{r.label}</Chip>}
              </td>
              <td style={{ padding:"12px 18px",color:C.textMuted,fontSize:13,fontFamily:"'DM Mono',monospace" }}>{m.joined}</td>
              <td style={{ padding:"12px 18px" }}>
                <Chip color={m.active?C.mid:C.textMuted} bg={m.active?C.light:C.bg}>
                  {m.active?"アクティブ":"招待済"}
                </Chip>
              </td>
              <td style={{ padding:"12px 18px",color:C.textFaint,fontSize:12 }}>
                {canEditRoles && !m.self ? "役割を変更可" : "—"}
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
    {tab==="billing"&&<div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap:20 }}>
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
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:14 }}>
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
            {members.length===0 && <tr><td colSpan={4} style={{ padding:"24px 18px",
              textAlign:"center", color:C.textMuted, fontSize:13 }}>
              メンバーはまだ登録されていません
            </td></tr>}
            {members.map(m=>{
              const r=ROLE_CFG[m.role]||ROLE_CFG.surveyor;
              const isSelf = !!m.self;
              return <tr key={m.id} style={{ borderBottom:`1px solid ${C.borderLight}`,
                background:isSelf?C.light:"transparent" }}>
                <td style={{ padding:"12px 18px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%",
                      background:`linear-gradient(135deg,${C.primary},${C.blue})`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      color:C.white, fontWeight:700, fontSize:13 }}>{(m.name||"?")[0]}</div>
                    <div>
                      <div style={{ color:C.text, fontSize:14, fontWeight:600 }}>{m.name}</div>
                      {isSelf && <span style={{ fontSize:11, color:C.mid }}>あなた</span>}
                    </div>
                  </div>
                </td>
                <td style={{ padding:"12px 18px", color:C.textMuted, fontSize:13 }}>{m.email||"—"}</td>
                <td style={{ padding:"12px 18px" }}><Chip color={r.color} bg={r.badge}>{r.label}</Chip></td>
                <td style={{ padding:"12px 18px" }}>
                  {!isSelf && <select value={m.role}
                    onChange={e=>onUpdateRole?.(m.id, e.target.value)}
                    style={{ ...INP, fontSize:12, padding:"5px 10px" }}>
                    {Object.entries(ROLE_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>}
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
  // Real accounts start empty and load from Supabase; only the unconfigured
  // demo shows sample projects (which must never be synced to a real DB).
  const [projects,setProjects]=useState(isConfigured ? [] : INIT_PROJECTS);
  const [showNew,setShowNew]=useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const [profileTab,setProfileTab]=useState("profile");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [members, setMembers] = useState([]); // 組織メンバー（profilesから取得）

  // ── Supabase session persistence ──────────────────────
  useEffect(()=>{
    if(!isConfigured) return;
    supabase.auth.getSession().then(async ({ data:{ session } })=>{
      if(session){
        const { data:profile } = await supabase
          .from("profiles").select("*, organizations(*)")
          .eq("id", session.user.id).single();
        const orgData = profile?.organizations ?? { name:session.user.email, plan:"starter" };
        setOrg(orgData);
        setCurrentUser({ id:session.user.id, name:profile?.name||session.user.email,
          email:session.user.email, role:profile?.role||"pm" });
        setLoggedIn(true);

        // ── 組織メンバー（チーム名簿）を取得 ──
        // RLSにより同一組織のprofilesのみ取得可能。全メンバーが全案件を管理できる。
        if(orgData?.id){
          const { data:mem } = await supabase
            .from("profiles").select("id, name, role, created_at")
            .eq("organization_id", orgData.id)
            .order("created_at", { ascending:true });
          if(mem) setMembers(mem.map(m=>({
            id:m.id, name:m.name||"（名称未設定）", role:m.role||"surveyor",
            joined:m.created_at?new Date(m.created_at).toLocaleDateString("ja-JP"):"—",
            email:m.id===session.user.id?session.user.email:"",
            active:true, self:m.id===session.user.id,
          })));
        }

        // Fetch authoritative project list now that we have a session
        const { data: rows } = await supabase
          .from("projects").select("*").order("created_at", { ascending:false });
        if(rows?.length){
          const mapped = rows.map(row => ({
            id: String(row.id), name: row.name, client: row.client, type: row.type,
            stage: row.stage, pref: row.pref, deadline: row.deadline,
            area: row.area, budget: row.budget, desc: row.description,
            manager: row.manager, risk: row.risk, progress: row.progress,
            redListCount: row.red_list_count||0, tasks: row.tasks||{},
            customStages: row.custom_stages||null, species: row.species_data||[],
            comments: row.comments||[], documents: row.documents||[],
            projectClass: row.project_class||"1", juranDates: row.juran_dates||{}, activity: row.activity||[],
          }));
          setProjects(mapped);
          for(const p of mapped) saveProjectLocal(p).catch(()=>{});
        }

        // Flush any queued offline writes now that we have a session + org
        const qLen = await getSyncQueueLength().catch(()=>0);
        if(qLen > 0){
          // Patch in org_id for any queued entries that are missing it
          const queue = await idbGetAll("syncQueue").catch(()=>[]);
          for(const e of queue){
            if(e.table==="projects" && e.op==="upsert" && !e.payload?.organization_id){
              e.payload.organization_id = orgData?.id;
              // Re-save with org_id
              const db = await openDB();
              await new Promise((res,rej)=>{
                const r = db.transaction("syncQueue","readwrite").objectStore("syncQueue").put(e);
                r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
              }).catch(()=>{});
            }
          }
          setSyncing(true);
          await flushSyncQueue(supabase).catch(()=>{});
          setSyncing(false);
          setPendingSync(await getSyncQueueLength().catch(()=>0));
        }
      }
    });
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event)=>{
      if(event==="SIGNED_OUT"){ setLoggedIn(false); setOrg(null); setCurrentUser(null); setMembers([]); }
    });
    return ()=> subscription.unsubscribe();
  },[]);

  // ── メンバーの役割変更（管理者のみ）──────────────────────────────────────
  async function handleUpdateMemberRole(memberId, newRole){
    setMembers(ms => ms.map(m => m.id===memberId ? {...m, role:newRole} : m));
    if(isConfigured){
      const { error } = await supabase.from("profiles")
        .update({ role:newRole }).eq("id", memberId);
      if(error) console.error("役割更新エラー:", error.message);
    }
  }

  // ── Offline detection + sync ───────────────────────────────────────────────
  // Ref to suppress Realtime echoes of our own writes
  const recentlyWritten = React.useRef(new Set());

  // Mirror of projects for use inside sync callbacks (avoids stale closures)
  const projectsRef = React.useRef(projects);
  useEffect(()=>{ projectsRef.current = projects; }, [projects]);

  // When a queued field upload finishes, write its public URL back onto the
  // matching record (document or species photo)
  const linkUpload = React.useCallback(async (projectId, uploadId, url, kind) => {
    const p = projectsRef.current.find(x => String(x.id)===String(projectId));
    if(!p) return;
    if (kind === "species") {
      const species = (p.species||[]).map(s => ({ ...s,
        photos: (s.photos||[]).map(ph =>
          ph.uploadId===uploadId ? {...ph, url, pending:false} : ph) }));
      await updateProject({ ...p, species });
      return;
    }
    const documents = (p.documents||[]).map(d =>
      d.uploadId===uploadId ? {...d, url, pending:false} : d);
    await updateProject({ ...p, documents });
  }, []);

  useEffect(()=>{
    // ── 1. Load templates ────────────────────────────────────────────────────
    getAllTemplates().then(setSavedTemplates).catch(()=>{});

    // ── 2. Load projects: IndexedDB first (instant), then Supabase (authoritative)
    getAllProjectsLocal().then(async local => {
      // Migrate any legacy numeric IDs
      const migrated = [];
      for(const p of local){
        if(typeof p.id === "number" || /^\d{10,}$/.test(String(p.id))){
          const fixed = {...p, id: crypto.randomUUID()};
          await saveProjectLocal(fixed).catch(()=>{});
          await deleteProjectLocal(p.id).catch(()=>{});
          migrated.push(fixed);
        } else {
          migrated.push({...p, id: String(p.id)});
        }
      }
      if(migrated.length > 0) setProjects(migrated);
    }).catch(()=>{});

    // ── 3. Online/offline listeners ───────────────────────────────────────── ─────────────────────────────────────────
    const goOnline = async () => {
      setIsOnline(true);
      if(!isConfigured) return;
      setSyncing(true);
      await flushSyncQueue(supabase).catch(()=>{});
      await flushUploads(supabase, linkUpload).catch(()=>{}); // 現場のオフラインアップロードを送信
      setSyncing(false);
      setPendingSync(await getSyncQueueLength().catch(()=>0));
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    // ── 5. Poll queue every 10s ──────────────────────────────────────────────
    const poll = setInterval(async ()=>{
      const n = await getSyncQueueLength().catch(()=>0);
      const pendingUploads = await getUploads().then(u=>u.length).catch(()=>0);
      setPendingSync(n + pendingUploads);
      // Only flush if we have an active session (org loaded = safe to write)
      if((n > 0 || pendingUploads > 0) && navigator.onLine && isConfigured){
        const { data:{ session } } = await supabase.auth.getSession().catch(()=>({ data:{} }));
        if(!session) return; // not logged in yet, skip
        setSyncing(true);
        const result = await flushSyncQueue(supabase).catch(()=>({ synced:0, failed:0, error:null }));
        await flushUploads(supabase, linkUpload).catch(()=>{}); // 現場アップロードを送信
        setSyncing(false);
        const remainingQ = await getSyncQueueLength().catch(()=>0);
        const remainingU = await getUploads().then(u=>u.length).catch(()=>0);
        const remaining = remainingQ + remainingU;
        setPendingSync(remaining);
        // Surface a diagnostic error, or clear it once everything drained
        if(remaining === 0){ setSyncError(null); }
        else if(result.error){
          setSyncError(/42501|row-level security/.test(result.error)
            ? "権限エラー：アカウントの役割が管理者(admin)/PMでない可能性があります（プロフィールを確認してください）。"
            : result.error);
        }
      } else if(n === 0){ setSyncError(null); }
    }, 10000);

    // ── 6. Realtime subscription ─────────────────────────────────────────────
    let realtimeSub = null;
    if(isConfigured){
      realtimeSub = supabase
        .channel("projects-live")
        .on("postgres_changes",
          { event:"*", schema:"public", table:"projects" },
          (payload) => {
            if(payload.eventType === "DELETE"){
              const did = String(payload.old.id);
              setProjects(prev => prev.filter(p => String(p.id) !== did));
              deleteProjectLocal(did).catch(()=>{});
              return;
            }

            const row = payload.new;
            const rid = String(row.id);

            // Suppress echo of our own writes
            if(recentlyWritten.current.has(rid)){
              recentlyWritten.current.delete(rid);
              return;
            }

            const mapped = {
              id: rid, name: row.name, client: row.client, type: row.type,
              stage: row.stage, pref: row.pref, deadline: row.deadline,
              area: row.area, budget: row.budget, desc: row.description,
              manager: row.manager, risk: row.risk, progress: row.progress,
              redListCount: row.red_list_count||0, tasks: row.tasks||{},
              customStages: row.custom_stages||null, species: row.species_data||[],
              comments: row.comments||[], documents: row.documents||[],
              projectClass: row.project_class||"1", juranDates: row.juran_dates||{}, activity: row.activity||[],
            };

            setProjects(prev => {
              const idx = prev.findIndex(p => String(p.id) === rid);
              if(idx >= 0){
                const next = [...prev]; next[idx] = {...prev[idx], ...mapped}; return next;
              }
              return [...prev, mapped];
            });
            setSelectedProject(cur => cur && String(cur.id)===rid ? {...cur,...mapped} : cur);
            saveProjectLocal(mapped).catch(()=>{});
          }
        )
        .subscribe();
    }

    return ()=>{
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(poll);
      if(realtimeSub) supabase.removeChannel(realtimeSub);
    };
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

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  if(!loggedIn) return <LoginScreen onLogin={({org:o,user:u})=>{
    setOrg(o);
    setCurrentUser(u);
    setLoggedIn(true);
  }}/>;

  const nav=v=>{setActive(v);if(v!=="project")setSelectedProject(null);};
  const updateProject=async (proj)=>{
    const uid = String(proj.id);
    const u = {...proj, id: uid};

    // Update local state — upsert by ID
    setProjects(p => {
      const idx = p.findIndex(x => String(x.id) === uid);
      if(idx >= 0){ const n=[...p]; n[idx]=u; return n; }
      return [...p, u];
    });
    setSelectedProject(cur => cur && String(cur.id)===uid ? u : cur);
    await saveProjectLocal(u).catch(()=>{});

    if(!isConfigured) return;

    // Get org_id — from org state or from profile lookup
    const orgId = org?.id ?? (await supabase
      .from("profiles").select("organization_id")
      .eq("id",(await supabase.auth.getUser()).data.user?.id).single()
      .then(r=>r.data?.organization_id).catch(()=>null));

    if(!orgId){
      console.error("[Sync] No organization_id — cannot write to Supabase");
      return;
    }

    const clean = sanitizeProjectPayload({...u, description:u.desc, organization_id:orgId});

    if(navigator.onLine){
      // Mark as recently written BEFORE the request so Realtime echo is suppressed
      recentlyWritten.current.add(uid);
      const { error } = await upsertProjectResilient(supabase, clean);
      if(error){
        recentlyWritten.current.delete(uid);
        console.error("[Sync] upsert failed:", error.message, error.code);
        await enqueue("projects","upsert", clean).catch(()=>{});
        setPendingSync(n=>n+1);
      } else {
        // Clear any stale queue entries for this project
        const q = await idbGetAll("syncQueue").catch(()=>[]);
        for(const e of q){ if(String(e.payload?.id)===uid) await removeFromQueue(e.qid).catch(()=>{}); }
        setPendingSync(await getSyncQueueLength().catch(()=>0));
        // Auto-remove from recentlyWritten after 5s (Realtime should have arrived by then)
        setTimeout(()=> recentlyWritten.current.delete(uid), 5000);
      }
    } else {
      await enqueue("projects","upsert", clean).catch(()=>{});
      setPendingSync(n=>n+1);
    }
  };

  const handleDeleteProject = async (rawId) => {
    const id = String(rawId);
    setProjects(p => p.filter(x => String(x.id) !== id));
    if(selectedProject && String(selectedProject.id) === id){
      setSelectedProject(null); setActive("dashboard");
    }
    await deleteProjectLocal(id).catch(()=>{});
    // Clear any pending upsert for this project
    const q = await idbGetAll("syncQueue").catch(()=>[]);
    for(const e of q){ if(String(e.payload?.id)===id) await removeFromQueue(e.qid).catch(()=>{}); }
    setPendingSync(await getSyncQueueLength().catch(()=>0));
    if(isConfigured){
      if(navigator.onLine){
        recentlyWritten.current.add(id);
        const { error } = await supabase.from("projects").delete().eq("id",id);
        if(error){ console.error("[Delete] failed:", error.message); recentlyWritten.current.delete(id); }
        else setTimeout(()=> recentlyWritten.current.delete(id), 5000);
      } else {
        await enqueue("projects","delete",{id}).catch(()=>{});
        setPendingSync(n=>n+1);
      }
    }
  };

  const handleSaveTemplate = async (tmpl) => {
    await saveTemplate(tmpl).catch(()=>{});
    setSavedTemplates(await getAllTemplates().catch(()=>[]));
  };

  const handleDeleteTemplate = async (id) => {
    await deleteTemplate(id).catch(()=>{});
    setSavedTemplates(await getAllTemplates().catch(()=>[]));
  };

  const handleLogout = async () => {
    if(isConfigured) await supabase.auth.signOut();
    setLoggedIn(false); setOrg(null); setCurrentUser(null);
  };

  const openProfile = (tab="profile") => { setProfileTab(tab); setShowProfile(true); };

  const renderMain=()=>{
    if(active==="project"&&selectedProject)
      return <ProjectDetail project={selectedProject} setActive={setActive} onUpdate={updateProject} onSaveTemplate={handleSaveTemplate} currentUser={currentUser}/>;
    switch(active){
      case "dashboard":  return <Dashboard projects={projects} setSelectedProject={setSelectedProject}
        setActive={setActive} onNew={()=>setShowNew(true)}
        onDelete={handleDeleteProject} currentUser={currentUser}/>;
      case "scoping":    return <ScopingModule/>;
      case "species":    return <SpeciesModule/>;
      case "reports":    return <ReportModule projects={projects}/>;
      case "compliance": return <ComplianceModule/>;
      case "monitoring": return <MonitoringModule/>;
      case "account":    return <AccountModule org={org} currentUser={currentUser}
                           members={members} onUpdateRole={handleUpdateMemberRole}
                           projectCount={projects.length}/>;
      default: return null;
    }
  };

  return <div style={{ background:C.bg, minHeight:"100vh" }}>
    <Header org={org} currentUser={currentUser} onLogout={handleLogout}
      onOpenProfile={openProfile} setActive={nav} onMenuOpen={()=>setMobileMenuOpen(true)}/>
    <div style={{ display:"flex" }}>
      <Sidebar active={active} setActive={v=>{nav(v);setMobileMenuOpen(false);}} mobileOpen={mobileMenuOpen} onClose={()=>setMobileMenuOpen(false)}/>
      <main style={{ flex:1, padding: isMobile ? "16px 14px" : "32px 36px",
        minHeight:"calc(100vh - 64px)", maxWidth:1300, overflowX:"hidden", width:"100%" }}>
        {renderMain()}
      </main>
    </div>
    {showNew&&<NewProjectModal
      savedTemplates={savedTemplates}
      onSaveTemplate={handleSaveTemplate}
      onDeleteTemplate={handleDeleteTemplate}
      onSave={np=>{
        const full = { ...np, species:[], redListCount:0, progress:0, comments:[], documents:[] };
        // Add to local state immediately
        setProjects(p => {
          // Guard: never add if ID already exists
          if(p.find(x => String(x.id)===String(full.id))) return p;
          return [...p, full];
        });
        saveProjectLocal(full).catch(()=>{});
        setShowNew(false);
        // Write to Supabase (updateProject handles online/offline/queue)
        updateProject(full).catch(()=>{});
      }}
      onCancel={()=>setShowNew(false)}/>}
    {showProfile&&<ProfileSettingsModal currentUser={currentUser}
      initialTab={profileTab} onClose={()=>setShowProfile(false)}/>}
    <OfflineBar isOnline={isOnline} pendingCount={pendingSync} syncing={syncing}
      onManualSync={async ()=>{
        setSyncing(true); setSyncError(null);
        try {
          const result = await flushSyncQueue(supabase);
          const remaining = await getSyncQueueLength().catch(()=>0);
          if(remaining > 0 && result.error){
            const hint = /42501|row-level security/.test(result.error)
              ? "権限エラー：あなたのアカウントの役割が管理者(admin)またはPMでない可能性があります。"
              : result.error;
            setSyncError(`${remaining}件が同期できません — ${hint}`);
          } else {
            setSyncError(null);
          }
        } catch(e) { setSyncError(e.message); }
        setSyncing(false);
        setPendingSync(await getSyncQueueLength().catch(()=>0));
      }}
      syncError={syncError}/>
  </div>;
}

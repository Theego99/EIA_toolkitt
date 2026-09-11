export const VERIFIED_AT = "2026-09-11";
export const SOURCES = [
  {
    id: "law",
    title: "環境影響評価法（2026年4月1日施行版）",
    url: "https://laws.e-gov.go.jp/law/409AC0000000081/20260401_507AC0000000073",
  },
  {
    id: "order",
    title: "環境影響評価法施行令（対象事業・期間）",
    url: "https://laws.e-gov.go.jp/law/409CO0000000346",
  },
  {
    id: "period",
    title: "知事意見の期間と起算点（環境省通知）",
    url: "https://www.env.go.jp/hourei/19/000011.html",
  },
  {
    id: "solar",
    title: "太陽電池発電の規模改正・2027年4月1日施行",
    url: "https://www.env.go.jp/press/press_05279.html",
  },
  {
    id: "wind",
    title: "風力発電の対象規模改正",
    url: "https://www.env.go.jp/press/110033.html",
  },
  {
    id: "noise",
    title: "低周波音Q&A・風力発電への参照値の適用不可",
    url: "https://www.env.go.jp/air/teishuha/qa/index.html",
  },
  {
    id: "power",
    title: "発電所に係る環境影響評価（経済産業省）",
    url: "https://www.meti.go.jp/policy/safety_security/industrial_safety/sangyo/electric/files/1507chapter_one.pdf",
  },
];
export const LEGAL_NOTES = [
  [
    "適用確認",
    "国法の対象規模を下回っても自治体条例等の対象となり得ます。事業の種類・規模・地域・着手時期・変更内容に応じ、所管機関との確認を記録します。",
  ],
  [
    "配慮書",
    "第一種事業の計画段階手続を確認します。配慮書の一般意見聴取は一律の「法定30日」ではありません。第二種、条例、発電所等の適用関係は個別に確認します。",
  ],
  [
    "方法書・準備書",
    "一般の国法手続では公告・縦覧は一月間、意見提出は縦覧期間満了後二週間までです。説明会・インターネット公表も確認します。公告本文で確定した日付を管理します。",
  ],
  [
    "知事等の意見",
    "一般手続の知事意見は意見概要等の受領を起点に方法書90日、準備書120日以内です。発電所・都市計画・港湾計画・指定都市等の特例や条例の期限は別途確認します。",
  ],
  [
    "技術仕様",
    "四季の回数・日数、採水深、機器、測定条件等を全国一律の法定値として固定しません。項目・地域・事業別の主務省令、技術指針、採用した規格と版を記録します。",
  ],
  [
    "希少種と保護法令",
    "レッドリストのカテゴリーは法的な捕獲・採取規制と同義ではありません。種の保存法、鳥獣保護管理法、自然公園法、文化財・自治体条例等の適用と許可を別途確認します。",
  ],
  [
    "評価書・事後調査",
    "評価書の審査・補正・公告と着手制限を確認します。事後調査・報告書の要否と時期は予測の不確実性、保全措置、法第38条の2以下、主務省令・条例等によります。",
  ],
  [
    "風力・低周波音",
    "環境省の低周波音苦情の参照値を、風車の環境基準・合否判定に使用しません。発生源に適用される騒音指針と測定評価方法を選定します。",
  ],
];
export function addDays(iso, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== iso) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Informational calendar arithmetic only. The recorded public notice remains authoritative.
export function calendarMonth(iso) {
  if (!addDays(iso, 0)) return "";
  const d = new Date(`${iso}T00:00:00Z`),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function deadlineHints(entry, stage, route) {
  if (route !== "national-general" || !["2", "4"].includes(String(stage)))
    return {};
  return {
    monthReference: calendarMonth(entry.noticeDate),
    opinionEnd: addDays(entry.exhibitionEnd, 14),
    governorEnd: addDays(
      entry.summaryReceived,
      String(stage) === "2" ? 90 : 120,
    ),
  };
}
export function scaleHint(type, capacity, asOf) {
  if (
    !["solar", "wind"].includes(type) ||
    !Number.isFinite(Number(capacity)) ||
    Number(capacity) <= 0 ||
    !addDays(asOf, 0)
  )
    return "事業の詳細・規模・時期を確認してください。自動判定の対象外です。";
  const first = type === "wind" ? 50000 : asOf >= "2027-04-01" ? 20000 : 40000;
  const second = type === "wind" ? 37500 : asOf >= "2027-04-01" ? 15000 : 30000;
  const category =
    Number(capacity) >= first
      ? "第一種の規模以上"
      : Number(capacity) >= second
        ? "第二種の規模範囲（個別判定）"
        : "国法の出力規模未満（条例等の確認が必要）";
  return `${category}。第一種 ${first.toLocaleString()} kW以上、第二種 ${second.toLocaleString()} kW以上。設置・変更の条件、経過措置、所管機関の判断を確認してください。`;
}

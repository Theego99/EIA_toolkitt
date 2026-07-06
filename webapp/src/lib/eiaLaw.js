// ─────────────────────────────────────────────────────────────────────────────
// eiaLaw.js — 日本の環境影響評価（環境アセスメント）法定フレームワーク
//
// ユーザー提供の実務ガイドに基づく、環境影響評価法（法）の正確な符号化。
// このモジュールは以下を提供する:
//   - PROCEDURE_STAGES : 法定6手続（配慮書〜事後調査）と縦覧・意見期間
//   - LEGAL_PROJECT_TYPES : 法定13対象事業（第一種/第二種の規模要件付き）
//   - ENV_CATEGORIES / ENV_ITEMS : 技術指針の環境4区分と評価項目
//   - SELECTION_MATRIX : 事業タイプ別の標準項目選定（マトリクス方式）
//   - SURVEY_METHODS : 項目別の厳密な調査手法・技術規格（JIS等）
//   - HOHOSHO_TEMPLATE / JUNBISHO_TEMPLATE : 主務省令の章建て構成
// 手続の順序・省略は法律上変更できない。数値は実務ガイド準拠。
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. 法定手続の6ステージ ────────────────────────────────────────────────
// juranDays: 公告・縦覧の法定日数 / explanation: 住民説明会の要否
// governorOpinionDays: 都道府県知事・市町村長の意見提出期限（縦覧満了起算）
export const PROCEDURE_STAGES = [
  {
    id: 1,
    key: 'hairyo',
    short: '配慮書',
    name: '計画段階環境配慮書',
    article: '法第3条の2',
    juranDays: 30,
    explanation: false,
    governorOpinionDays: null,
    publicOpinion: true,
    color: '#059669',
    purpose:
      '事業の位置・規模の決定前に、重大な環境影響を回避・低減するための複数案を検討し、一般及び都道府県知事の意見を聴取する。',
    deliverable: '配慮書',
  },
  {
    id: 2,
    key: 'hoho',
    short: '方法書',
    name: '環境影響評価方法書',
    article: '法第5条〜第10条',
    juranDays: 30,
    explanation: true, // 住民説明会が義務
    governorOpinionDays: 90, // 知事・市町村長は90日以内に法的意見
    publicOpinion: true,
    color: '#2563EB',
    purpose:
      '対象地域で「何を」「どうやって」調査・予測・評価するかの計画書。30日の公告縦覧と住民説明会を実施。',
    deliverable: '方法書',
  },
  {
    id: 3,
    key: 'survey',
    short: '調査',
    name: '調査・予測・評価の実施',
    article: '法第11条〜第13条',
    juranDays: 0,
    explanation: false,
    governorOpinionDays: null,
    publicOpinion: false,
    color: '#D97706',
    purpose:
      '方法書で確定した手法に基づき、四季の現地調査（フィールドワーク）と予測シミュレーションを実施する実務フェーズ。',
    deliverable: '調査結果データ',
  },
  {
    id: 4,
    key: 'junbi',
    short: '準備書',
    name: '環境影響評価準備書',
    article: '法第14条〜第20条',
    juranDays: 30,
    explanation: true, // 説明会が必須、必要に応じ公聴会
    governorOpinionDays: 120, // 知事意見（縦覧満了後、標準的に約4ヶ月）
    publicOpinion: true,
    hearing: true, // 公聴会（必要に応じ）
    color: '#7C3AED',
    purpose:
      '調査・予測結果と環境保全措置をまとめたドラフト。30日の公告縦覧・説明会が必須、必要に応じ公聴会。知事・市町村長の最終意見を集約。',
    deliverable: '準備書',
  },
  {
    id: 5,
    key: 'hyoka',
    short: '評価書',
    name: '環境影響評価書',
    article: '法第21条〜第27条',
    juranDays: 30,
    explanation: false,
    governorOpinionDays: null,
    publicOpinion: false,
    color: '#DB2777',
    purpose:
      '準備書への全意見と事業者見解・修正を反映した最終報告書。認可官庁及び環境大臣の審査を経て事業認可の条件となる。',
    deliverable: '評価書',
  },
  {
    id: 6,
    key: 'monitoring',
    short: '事後調査',
    name: '事後調査（工事中・供用後モニタリング）',
    article: '法第38条の2',
    juranDays: 0,
    explanation: false,
    governorOpinionDays: null,
    publicOpinion: false,
    color: '#0891B2',
    purpose:
      '評価書の予測どおり環境が保全されているか、工事中・供用後に実測モニタリングを行い、結果を定期的に自治体へ報告する。',
    deliverable: '事後調査報告書',
  },
]

// ── 2. 環境4区分（技術指針） ──────────────────────────────────────────────
export const ENV_CATEGORIES = {
  pollution: { key: 'pollution', label: '公害の防止', color: '#DC2626' },
  nature: { key: 'nature', label: '自然環境の保全', color: '#059669' },
  amenity: { key: 'amenity', label: '快適性の確保', color: '#2563EB' },
  load: { key: 'load', label: '環境負荷の低減', color: '#7C3AED' },
}

// ── 3. 環境影響評価項目（項目） ───────────────────────────────────────────
// survey: 対応する SURVEY_METHODS のキー
export const ENV_ITEMS = [
  // 1. 公害の防止
  { key: 'air', label: '大気質', category: 'pollution', survey: 'air' },
  { key: 'water', label: '水質・水文', category: 'pollution', survey: 'water' },
  { key: 'groundwater', label: '地下水・水源', category: 'pollution', survey: 'groundwater' },
  { key: 'soil', label: '土壌汚染', category: 'pollution', survey: 'soil' },
  { key: 'noise', label: '騒音', category: 'pollution', survey: 'noise' },
  { key: 'vibration', label: '振動', category: 'pollution', survey: 'vibration' },
  { key: 'lowfreq', label: '低周波音', category: 'pollution', survey: 'lowfreq' },
  { key: 'subsidence', label: '地盤沈下', category: 'pollution', survey: null },
  { key: 'odor', label: '悪臭', category: 'pollution', survey: null },
  // 2. 自然環境の保全
  { key: 'plants', label: '植物', category: 'nature', survey: 'plants' },
  { key: 'birds', label: '動物（鳥類）', category: 'nature', survey: 'birds' },
  { key: 'mammals', label: '動物（哺乳類）', category: 'nature', survey: 'mammals' },
  { key: 'aquatic', label: '動物（魚類・水生生物）', category: 'nature', survey: 'water' },
  { key: 'ecosystem', label: '生態系', category: 'nature', survey: null },
  { key: 'landform', label: '地形・地質', category: 'nature', survey: null },
  // 3. 快適性の確保
  { key: 'landscape', label: '景観', category: 'amenity', survey: null },
  { key: 'recreation', label: '人と自然との触れ合い活動の場', category: 'amenity', survey: null },
  // 4. 環境負荷の低減
  { key: 'waste', label: '廃棄物等', category: 'load', survey: null },
  { key: 'ghg', label: '温室効果ガス等', category: 'load', survey: null },
]

export const ENV_ITEM_BY_KEY = Object.fromEntries(ENV_ITEMS.map((i) => [i.key, i]))

// ── 4. 法定13対象事業 ─────────────────────────────────────────────────────
// class1: 一律アセス義務（第一種） / class2: 個別判断（第二種）
// items: 技術指針マトリクスに基づく標準選定項目（事業者が調整可能）
export const LEGAL_PROJECT_TYPES = [
  {
    key: 'road', label: '道路', icon: '🛣️', group: '交通',
    class1: '高速自動車国道／一般国道（4車線以上・10km以上）',
    class2: '4車線以上・7.5km以上',
    focus: '走行騒音・振動・NOx/PM',
    items: ['air', 'noise', 'vibration', 'water', 'plants', 'birds', 'mammals', 'ecosystem', 'landform', 'landscape', 'waste'],
  },
  {
    key: 'river', label: '河川（ダム・堰・放水路）', icon: '🌊', group: '水系',
    class1: '貯水面積100ha以上 等',
    class2: '貯水面積75ha以上 等',
    focus: '魚類の遡上阻害・生態系変化・水文',
    items: ['water', 'groundwater', 'aquatic', 'plants', 'birds', 'mammals', 'ecosystem', 'landform', 'landscape', 'waste'],
  },
  {
    key: 'rail', label: '鉄道（新幹線・在来線・新交通）', icon: '🚄', group: '交通',
    class1: '新幹線鉄道／延長10km以上',
    class2: '延長7.5km以上',
    focus: '走行騒音・振動・低周波音',
    items: ['noise', 'vibration', 'lowfreq', 'air', 'plants', 'birds', 'mammals', 'ecosystem', 'landscape', 'waste'],
  },
  {
    key: 'airport', label: '飛行場', icon: '✈️', group: '交通',
    class1: '滑走路長2,500m以上',
    class2: '滑走路長1,875m以上',
    focus: '航空機騒音・大気質・鳥衝突',
    items: ['noise', 'lowfreq', 'air', 'water', 'plants', 'birds', 'mammals', 'ecosystem', 'landscape', 'waste'],
  },
  {
    key: 'power', label: '発電所', icon: '⚡', group: 'エネルギー',
    class1: '種別により規模要件が異なる（下記subtypes参照）',
    class2: '種別により規模要件が異なる',
    focus: '種別により重点項目が大きく異なる',
    // 発電所は種別で重点項目が大きく異なるため subtype を持つ
    subtypes: [
      { key: 'thermal', label: '火力', icon: '🔥', class1: '出力15万kW以上',
        focus: '排ガス（SOx/NOx）・温排水',
        items: ['air', 'water', 'noise', 'vibration', 'ghg', 'landscape', 'waste', 'ecosystem'] },
      { key: 'wind', label: '風力', icon: '💨', class1: '出力5万kW以上',
        focus: '低周波音・バードストライク・景観・光害',
        items: ['lowfreq', 'noise', 'birds', 'mammals', 'plants', 'ecosystem', 'landscape', 'landform', 'waste'] },
      { key: 'solar', label: '太陽光', icon: '☀️', class1: '出力4万kW以上',
        focus: '景観・光害・土地改変・水文',
        items: ['landscape', 'water', 'plants', 'birds', 'mammals', 'ecosystem', 'landform', 'waste'] },
      { key: 'hydro', label: '水力', icon: '💧', class1: '出力3万kW以上',
        focus: '河川流況・魚類遡上・生態系',
        items: ['water', 'groundwater', 'aquatic', 'plants', 'birds', 'mammals', 'ecosystem', 'landform', 'landscape'] },
      { key: 'geothermal', label: '地熱', icon: '🌋', class1: '出力1万kW以上',
        focus: '地下水・温泉・大気（硫化水素）',
        items: ['groundwater', 'water', 'air', 'plants', 'birds', 'mammals', 'ecosystem', 'landform', 'landscape'] },
      { key: 'nuclear', label: '原子力', icon: '⚛️', class1: '全て第一種',
        focus: '温排水・放射線監視・広域防災',
        items: ['water', 'air', 'aquatic', 'plants', 'birds', 'mammals', 'ecosystem', 'landscape', 'waste'] },
    ],
    items: ['air', 'water', 'noise', 'landscape', 'ecosystem', 'waste'],
  },
  {
    key: 'waste', label: '廃棄物処理施設', icon: '♻️', group: '施設',
    class1: '最終処分場 面積30ha以上／焼却施設 等',
    class2: '面積25ha以上',
    focus: '排ガス・悪臭・水質・浸出水',
    items: ['air', 'odor', 'water', 'groundwater', 'soil', 'noise', 'ghg', 'ecosystem', 'landscape', 'waste'],
  },
  {
    key: 'reclaim', label: '公有水面埋立・干拓', icon: '🏗️', group: '土地',
    class1: '面積50ha超',
    class2: '面積40ha以上',
    focus: '海域水質・底質・海生生態系',
    items: ['water', 'aquatic', 'ecosystem', 'birds', 'landform', 'landscape', 'waste'],
  },
  {
    key: 'landadj', label: '土地区画整理事業', icon: '📐', group: '土地',
    class1: '面積100ha以上',
    class2: '面積75ha以上',
    focus: '土地改変・生息地分断・景観',
    items: ['air', 'noise', 'vibration', 'water', 'plants', 'birds', 'mammals', 'ecosystem', 'landscape', 'recreation', 'waste'],
  },
  {
    key: 'newtown', label: '新住宅市街地開発事業', icon: '🏘️', group: '土地',
    class1: '面積100ha以上',
    class2: '面積75ha以上',
    focus: '森林伐採・生息地分断・レクリエーション地消失',
    items: ['air', 'noise', 'water', 'plants', 'birds', 'mammals', 'ecosystem', 'landform', 'landscape', 'recreation', 'waste'],
  },
  {
    key: 'industry', label: '工業団地造成事業', icon: '🏭', group: '土地',
    class1: '面積100ha以上',
    class2: '面積75ha以上',
    focus: '土地改変・水質・大気（将来立地）',
    items: ['air', 'water', 'soil', 'noise', 'plants', 'birds', 'mammals', 'ecosystem', 'landscape', 'waste'],
  },
  {
    key: 'urbanbase', label: '新都市基盤整備事業', icon: '🏙️', group: '土地',
    class1: '面積100ha以上',
    class2: '面積75ha以上',
    focus: '大規模都市基盤改変',
    items: ['air', 'noise', 'vibration', 'water', 'plants', 'birds', 'mammals', 'ecosystem', 'landscape', 'recreation', 'waste'],
  },
  {
    key: 'logistics', label: '流通業務団地造成事業', icon: '🚚', group: '土地',
    class1: '面積100ha以上',
    class2: '面積75ha以上',
    focus: 'トラック交通・騒音・大気',
    items: ['air', 'noise', 'vibration', 'water', 'plants', 'birds', 'ecosystem', 'landscape', 'waste'],
  },
  {
    key: 'residential', label: '宅地造成・複合開発', icon: '🏠', group: '土地',
    class1: '一団の土地の総合開発 面積100ha以上',
    class2: '面積75ha以上',
    focus: '土地改変・景観・生息地',
    items: ['air', 'noise', 'water', 'plants', 'birds', 'mammals', 'ecosystem', 'landform', 'landscape', 'recreation', 'waste'],
  },
]

export const LEGAL_TYPE_BY_KEY = Object.fromEntries(LEGAL_PROJECT_TYPES.map((t) => [t.key, t]))

// ── 5. 調査手法の技術仕様（調査手法） ─────────────────────────────────────
// 方法書「第5章 調査、予測及び評価の手法」の根拠となる標準規格。
export const SURVEY_METHODS = {
  plants: {
    label: '植物',
    category: '自然環境',
    method: 'コドラート法（方形象枠法）＋ライン・トランセクト法',
    seasons: ['春', '夏', '秋', '冬'],
    spec:
      '群落規模に応じ、草本層1m×1m・亜高木層5m×5m・高木層（林冠）20m×20mの方形象枠を設定。枠内の全出現種名・被度・群度を記録し現存量と階層構造を定量化。環境省及び都道府県レッドリスト（RDB）記載の希少種を全域で精査。',
    standard: '環境省レッドリスト／都道府県RDB',
  },
  birds: {
    label: '鳥類',
    category: '自然環境',
    method: 'ラインセンサス法＋定点調査法（ポイントカウント法）',
    seasons: ['春', '夏', '秋', '冬'],
    spec:
      '実施区域に1〜2kmのルートを設定し、日の出から午前中に時速約2kmで歩行、目視・鳴き声で種名・個体数・行動を記録。風力発電では風車設置予定地を見渡す定点で高倍率スコープにより飛翔高度（ブレード通過高度か）と飛行経路を1日10時間以上連続追跡。',
    standard: 'バードストライク評価（風力）',
  },
  mammals: {
    label: '哺乳類',
    category: '自然環境',
    method: '自動撮影カメラ（カメラトラップ）＋痕跡調査＋捕獲トラップ法',
    seasons: ['春', '夏', '秋', '冬'],
    spec:
      '赤外線センサー付自動撮影カメラを獣道・水場・尾根筋に10haあたり1台以上配置し、各季最低30日連続稼働。中大型哺乳類（カモシカ・ツキノワグマ・キツネ・テン等）の利用頻度を特定。足跡・糞・食痕・爪痕のフィールドサインをGPS記録しルート沿いで全数サンプリング。',
    standard: 'カメラトラップ 10ha/台',
  },
  water: {
    label: '水質・公共用水域',
    category: '水環境',
    method: '現場水質測定＋検水ラボ分析',
    seasons: ['春', '夏', '秋', '冬'],
    spec:
      'JIS K 0102（工場排水試験方法）に基づき、河川では流心部の表層（水面下20〜50cm）から採水。必須パラメータ：pH・DO・BOD（湖沼海域はCOD）・SS・大腸菌群数。工事期土砂流出が懸念される場合は降雨出水時の臨時採水でSSバックグラウンドを確定。',
    standard: 'JIS K 0102',
  },
  groundwater: {
    label: '地下水・水源',
    category: '水環境',
    method: '観測井戸を用いた揚水試験＋トレーサー試験',
    seasons: [],
    spec:
      'ボーリング孔を観測井戸に転用し一定流量で地下水を強制汲み上げ、周囲観測孔の水位降下を電子式水圧水位計で秒単位記録。透水係数k・貯留係数を算出（Theisの式）し、地下水流動解析モデル（MODFLOW等）の入力データとする。トンネル掘削・大規模切土に伴う水源枯渇を予測。',
    standard: 'Theis法／MODFLOW',
  },
  noise: {
    label: '騒音',
    category: '公害',
    method: 'クラス1精密騒音計による24時間連続サンプリング',
    seasons: [],
    spec:
      'JIS C 1509-1適合クラス1精密騒音計を使用。マイクは地上1.2〜1.5mに防風スクリーン装着で設置。平日・休日の各24時間を測定し、時間帯別（昼6-22時／夜22-6時）のLAeq及びL50を算出。風速5m/s以上・降雨時は風雑音・雨音を避け欠測処理。',
    standard: 'JIS C 1509-1（クラス1）',
  },
  vibration: {
    label: '振動',
    category: '公害',
    method: '振動レベル計による測定',
    seasons: [],
    spec:
      '地表面での鉛直方向振動レベル（L10）を昼夜別に測定。建設機械・走行交通の発生源振動及び伝搬を評価し、振動規制法の規制基準と対比する。',
    standard: '振動規制法',
  },
  lowfreq: {
    label: '低周波音',
    category: '公害',
    method: '低周波音レベル計による周波数分析',
    seasons: [],
    spec:
      '主に風力発電ブレード回転音・大型コンプレッサーを対象に周波数1〜80Hzの空気振動を測定。JIS C 1514適合の低周波音レベル計で1/3オクターブバンド実効値（G特性含む）を平坦特性で測定。評価点で背景騒音と稼働時の差分をdB分離し、環境省「低周波音苦情に関する参照値」及びG特性評価値（概ね92dB超で苦情リスク）と比較。',
    standard: 'JIS C 1514／G特性92dB',
  },
  air: {
    label: '大気質',
    category: '公害',
    method: '吸引式自動測定器の現地設置＋パッシブサンプラー法',
    seasons: ['春', '夏', '秋', '冬'],
    spec:
      '対象物質：NO₂・SPM・PM2.5・SO₂。評価点に測定局（アセス小屋）を設置し溶液導電率法（SO₂）・化学発光法（NOx）の自動測定器を稼働。各季最低7日間連続で毎時データを取得。採気口は地上1.5〜3m。AMeDAS又は現地超音波風向風速計データ（風向・風速・日射・放射）と完全同期し、プルーム・パフ拡散モデルの検証データとする。',
    standard: '化学発光法／プルーム・パフモデル',
  },
  soil: {
    label: '土壌汚染',
    category: '公害',
    method: '土壌溶出量・含有量調査',
    seasons: [],
    spec:
      '土壌汚染対策法の特定有害物質を対象に、地歴調査に基づく区画でサンプリング。溶出量基準・含有量基準と対比する。',
    standard: '土壌汚染対策法',
  },
}

// ── 6. 法定書類の章建て構成テンプレート ───────────────────────────────────
// 主務省令で定める標準構成。実務上この構造の踏襲が法適合の前提。
export const HOHOSHO_TEMPLATE = {
  title: '環境影響評価方法書',
  chapters: [
    { n: 1, title: '事業者の名称、代表者の氏名及び主たる事務所の所在地', sub: [] },
    {
      n: 2, title: '対象事業の目的及び内容',
      sub: ['事業の背景と必要性', '事業の種類、規模及び実施地域', '事業計画の概要（土地利用計画、主要構造物の配置等）'],
    },
    {
      n: 3, title: '対象事業実施区域及びその周囲の概況',
      sub: ['社会的状況（人口、土地利用、関係法令による規制地域等）', '自然的状況（地形・地質、気象、水系、動植物の概要）'],
    },
    {
      n: 4, title: '環境影響評価項目の選定',
      sub: ['事業活動と環境要素のマトリクス（影響因子の抽出）', '選定項目及び非選定とした理由（チェックリスト方式）'],
    },
    {
      n: 5, title: '調査、予測及び評価の手法',
      sub: ['項目別の調査手法（時期、地点、方法の明記）', '予測の手法（予測の時期、範囲、用いるモデル・数式）', '評価の基準・考え方（環境基準等との整合性）'],
    },
    { n: '巻末', title: '巻末資料 / 各種図面 / 意見書提出用紙', sub: [] },
  ],
}

export const JUNBISHO_TEMPLATE = {
  title: '環境影響評価準備書',
  chapters: [
    {
      n: 1, title: '方法書に対する知事・市町村長・住民意見の概要及び事業者の見解',
      sub: ['意見の要約と項目ごとの対応方針', '方法書からの変更点（調査地点の追加、手法の修正等）'],
    },
    { n: 2, title: '対象事業の目的及び内容（確定版）', sub: [] },
    { n: 3, title: '対象事業実施区域及びその周囲の概況（詳細データ版）', sub: [] },
    {
      n: 4, title: '環境影響評価の実施結果（本論）',
      sub: [
        '大気質（調査結果、予測モデル、環境基準との対比、評価）',
        '騒音・振動・低周波音（実測値、コンターマップ、評価）',
        '水質・水文（地下水、地表水、排水影響のシミュレーション）',
        '動物・植物・生態系（確認種のリスト、注目種の行動圏解析）',
        '景観・触れ合い活動の場（フォトモンタージュによる予測評価）',
      ],
    },
    {
      n: 5, title: '環境保全措置',
      sub: ['工事中の低減策（濁水防止カーテン、低騒音型機器の採用等）', '供用後の低減策（緑地帯の造成、排ガス処理装置のスペック等）', '措置の不確実性と代替案の検討結果'],
    },
    {
      n: 6, title: '事後調査の計画',
      sub: ['調査項目、地点、周期、及び異常値検出時の対応フロー'],
    },
    {
      n: 7, title: '総合評価',
      sub: ['各環境要素を統合した総合的な環境影響の結論'],
    },
    { n: '巻末', title: '巻末資料（生データ、気象統計、確認動植物全リスト、シミュレーションコード）', sub: [] },
  ],
}

// ── 7. ヘルパー ───────────────────────────────────────────────────────────

/** 事業タイプ（＋発電所subtype）の標準選定項目キー配列を返す */
export function selectedItemsFor(typeKey, subtypeKey) {
  const t = LEGAL_TYPE_BY_KEY[typeKey]
  if (!t) return []
  if (t.subtypes && subtypeKey) {
    const st = t.subtypes.find((s) => s.key === subtypeKey)
    if (st) return st.items
  }
  return t.items || []
}

/** 選定項目を環境4区分ごとにグルーピングして返す */
export function itemsByCategory(itemKeys) {
  const groups = { pollution: [], nature: [], amenity: [], load: [] }
  for (const key of itemKeys) {
    const item = ENV_ITEM_BY_KEY[key]
    if (item) groups[item.category].push(item)
  }
  return groups
}

/** アプリ側の事業タイプキー → 法定タイプ（発電所サブタイプ含む）を解決 */
export function resolveLegalType(appTypeKey) {
  if (LEGAL_TYPE_BY_KEY[appTypeKey]) return { typeKey: appTypeKey, subtypeKey: null }
  const alias = { geo: 'geothermal', dam: 'river', housing: 'newtown' }
  const key = alias[appTypeKey] || appTypeKey
  if (LEGAL_TYPE_BY_KEY[key]) return { typeKey: key, subtypeKey: null }
  for (const t of LEGAL_PROJECT_TYPES) {
    if (t.subtypes) {
      const st = t.subtypes.find((s) => s.key === key)
      if (st) return { typeKey: t.key, subtypeKey: st.key }
    }
  }
  return { typeKey: null, subtypeKey: null }
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/**
 * 方法書 / 準備書 の法定構成に沿った HTML ドキュメントを、案件データから生成する。
 * 印刷（PDF）・Word(.doc) 保存の両方に使える自己完結HTMLを返す。
 * @param {'hoho'|'junbi'} kind
 * @param {object} project アプリの案件オブジェクト
 */
export function buildDocument(kind, project) {
  const tpl = kind === 'junbi' ? JUNBISHO_TEMPLATE : HOHOSHO_TEMPLATE
  const { typeKey, subtypeKey } = resolveLegalType(project?.type)
  const typeObj = typeKey ? LEGAL_TYPE_BY_KEY[typeKey] : null
  const typeLabel = typeObj
    ? typeObj.label + (subtypeKey ? `（${typeObj.subtypes.find((s) => s.key === subtypeKey)?.label}）` : '')
    : project?.type || '—'
  const itemKeys = typeKey ? selectedItemsFor(typeKey, subtypeKey) : ENV_ITEMS.map((i) => i.key)
  const grouped = itemsByCategory(itemKeys)
  const today = new Date().toLocaleDateString('ja-JP')
  const species = project?.species || []

  // 章ごとに、該当データがあれば差し込む
  const chapterBody = (ch) => {
    // 方法書 第4章：項目選定マトリクス
    if (kind === 'hoho' && ch.n === 4) {
      return (
        `<table class="tbl"><thead><tr><th>環境区分</th><th>選定項目</th></tr></thead><tbody>` +
        Object.values(ENV_CATEGORIES)
          .map(
            (cat) =>
              `<tr><td><b>${esc(cat.label)}</b></td><td>${
                grouped[cat.key].map((i) => esc(i.label)).join('、') || '<span class="muted">選定なし</span>'
              }</td></tr>`
          )
          .join('') +
        `</tbody></table>`
      )
    }
    // 方法書 第5章：調査手法の技術仕様
    if (kind === 'hoho' && ch.n === 5) {
      const rows = itemKeys
        .map((k) => ({ item: ENV_ITEM_BY_KEY[k], m: SURVEY_METHODS[ENV_ITEM_BY_KEY[k]?.survey] }))
        .filter((r) => r.m)
      return (
        `<table class="tbl"><thead><tr><th>項目</th><th>調査手法</th><th>規格</th><th>時期</th></tr></thead><tbody>` +
        rows
          .map(
            (r) =>
              `<tr><td>${esc(r.item.label)}</td><td>${esc(r.m.method)}<div class="muted small">${esc(
                r.m.spec
              )}</div></td><td>${esc(r.m.standard || '—')}</td><td>${esc(
                r.m.seasons?.join('・') || '—'
              )}</td></tr>`
          )
          .join('') +
        `</tbody></table>`
      )
    }
    // 準備書 第4章：実施結果（確認種リスト）
    if (kind === 'junbi' && ch.n === 4) {
      const rl = species.filter((s) => ['CR', 'EN', 'VU', 'NT'].includes(s.status))
      const list = species.length
        ? `<p>確認種数：<b>${species.length}</b>種（うち重要種 <b>${rl.length}</b>種）</p>` +
          `<table class="tbl"><thead><tr><th>和名</th><th>学名</th><th>分類</th><th>カテゴリ</th><th>確認地点</th></tr></thead><tbody>` +
          species
            .map(
              (s) =>
                `<tr><td>${esc(s.name)}</td><td><i>${esc(s.latin || '')}</i></td><td>${esc(
                  s.type || ''
                )}</td><td>${
                  ['CR', 'EN', 'VU', 'NT'].includes(s.status)
                    ? `<b style="color:#b91c1c">${esc(s.status)}</b>`
                    : esc(s.status || '')
                }</td><td>${esc(s.location || '')}</td></tr>`
            )
            .join('') +
          `</tbody></table>`
        : '<p class="muted">確認種データが未登録です。案件の「種記録」から入力してください。</p>'
      return (
        list +
        ch.sub.map((s) => `<h3>${esc(s)}</h3><p class="ph">［記載欄］</p>`).join('')
      )
    }
    // それ以外：小見出し + 記載欄
    return ch.sub.length
      ? ch.sub.map((s) => `<h3>${esc(s)}</h3><p class="ph">［記載欄］</p>`).join('')
      : '<p class="ph">［記載欄］</p>'
  }

  const chaptersHtml = tpl.chapters
    .map(
      (ch) =>
        `<section><h2>${ch.n === '巻末' ? '' : `第${ch.n}章　`}${esc(ch.title)}</h2>${chapterBody(ch)}</section>`
    )
    .join('')

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(tpl.title)} — ${esc(
    project?.name || ''
  )}</title><style>
    body{font-family:'Noto Serif JP','Yu Mincho',serif;color:#1a1f1c;max-width:820px;margin:0 auto;padding:48px 40px;line-height:1.8}
    .cover{text-align:center;padding:120px 0 80px;border-bottom:3px double #1B4332}
    .cover h1{font-size:30px;margin:0 0 40px}.cover .name{font-size:22px;font-weight:700}
    .meta{margin-top:60px;color:#4a5550;font-size:15px}
    h2{font-size:19px;border-left:6px solid #1B4332;padding-left:12px;margin:38px 0 14px}
    h3{font-size:15px;color:#2D6A4F;margin:18px 0 6px}
    .ph{color:#8a948e;background:#f7f5ef;border:1px dashed #ddd8ce;padding:8px 12px;border-radius:6px}
    .tbl{width:100%;border-collapse:collapse;margin:10px 0;font-family:'Noto Sans JP',sans-serif;font-size:13px}
    .tbl th{background:#1B4332;color:#fff;padding:8px 10px;text-align:left}
    .tbl td{border:1px solid #ddd8ce;padding:8px 10px;vertical-align:top}
    .muted{color:#8a948e}.small{font-size:12px;margin-top:4px}
    @media print{body{padding:0}.cover{padding:200px 0 100px}}
  </style></head><body>
    <div class="cover">
      <h1>${esc(tpl.title)}</h1>
      <div class="name">${esc(project?.name || '（案件名未設定）')}</div>
      <div class="meta">
        事業者：${esc(project?.client || '—')}<br>
        対象事業：${esc(typeLabel)}<br>
        実施区域：${esc(project?.pref || '—')}<br>
        作成日：${esc(today)}
      </div>
    </div>
    ${chaptersHtml}
    <p class="muted small" style="margin-top:60px;text-align:center">
      本書はEIAツールキットにより法定構成（主務省令）に基づき自動生成された草案です。提出前に内容をご確認ください。
    </p>
  </body></html>`
}

/**
 * 縦覧開始日から法定期限を計算する。
 * @returns {{ juranEnd: Date|null, governorOpinion: Date|null }}
 */
export function statutoryDeadlines(stageKey, juranStartISO) {
  const stage = PROCEDURE_STAGES.find((s) => s.key === stageKey)
  if (!stage || !juranStartISO) return { juranEnd: null, governorOpinion: null }
  const start = new Date(juranStartISO)
  if (isNaN(start)) return { juranEnd: null, governorOpinion: null }
  const juranEnd = stage.juranDays
    ? new Date(start.getTime() + stage.juranDays * 86400000)
    : null
  const governorOpinion =
    stage.governorOpinionDays && juranEnd
      ? new Date(juranEnd.getTime() + stage.governorOpinionDays * 86400000)
      : null
  return { juranEnd, governorOpinion }
}

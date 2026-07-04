// ─────────────────────────────────────────────────────────────────────────────
// 法定EIA定数（環境影響評価法・施行令・基本的事項準拠）
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';

/// 法定EIA手続き 6段階
/// 意見聴取は方法書・準備書に内包される（独立段階ではない）
class EiaStage {
  final int id;
  final String short;
  final String label;
  final Color color;
  final String desc;
  final bool statutory; // 法令上の手続き段階か
  final bool juran; // 公告・縦覧（30日間）があるか

  const EiaStage({
    required this.id,
    required this.short,
    required this.label,
    required this.color,
    required this.desc,
    required this.statutory,
    required this.juran,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'short': short,
        'label': label,
        'color': color.value,
        'desc': desc,
        'statutory': statutory,
        'juran': juran,
      };

  factory EiaStage.fromJson(Map<String, dynamic> j) => EiaStage(
        id: j['id'] as int,
        short: j['short'] as String,
        label: j['label'] as String,
        color: Color(j['color'] as int),
        desc: j['desc'] as String? ?? '',
        statutory: j['statutory'] as bool? ?? true,
        juran: j['juran'] as bool? ?? false,
      );
}

const kStages = [
  EiaStage(
    id: 1,
    short: '配慮書',
    label: '配慮書手続',
    color: Color(0xFF059669),
    desc: '計画段階からの早期環境配慮（法第3条の2〜）',
    statutory: true,
    juran: false,
  ),
  EiaStage(
    id: 2,
    short: '方法書',
    label: '方法書手続',
    color: Color(0xFF2563EB),
    desc: '調査手法の確定／公告縦覧30日／住民・知事意見（法第5条〜）',
    statutory: true,
    juran: true,
  ),
  EiaStage(
    id: 3,
    short: '現地調査',
    label: '現地調査',
    color: Color(0xFFD97706),
    desc: '現地調査・データ取得（業務実施フェーズ）',
    statutory: false,
    juran: false,
  ),
  EiaStage(
    id: 4,
    short: '準備書',
    label: '準備書手続',
    color: Color(0xFF7C3AED),
    desc: '準備書作成／公告縦覧30日／知事意見4ヶ月（法第14条〜）',
    statutory: true,
    juran: true,
  ),
  EiaStage(
    id: 5,
    short: '評価書',
    label: '評価書手続',
    color: Color(0xFFDC2626),
    desc: '評価書作成・主務大臣確認・公告縦覧（法第21条〜）',
    statutory: true,
    juran: true,
  ),
  EiaStage(
    id: 6,
    short: '事後調査',
    label: '事後調査・報告書',
    color: Color(0xFF0891B2),
    desc: '工事中・供用後モニタリング・報告書（法第38条の2）',
    statutory: true,
    juran: false,
  ),
];

/// 縦覧期間（日数）— 法定30日
const kJuranDays = 30;

/// 準備書の知事意見期限 — 縦覧終了後4ヶ月（120日）
const kGovernorOpinionDays = 120;

// ─────────────────────────────────────────────────────────────────────────────
// 対象事業種（施行令 別表）
// ─────────────────────────────────────────────────────────────────────────────
class ProjectType {
  final String value;
  final String group;
  final String label;
  final String icon;
  final String class1Threshold;
  final String class2Threshold;

  const ProjectType({
    required this.value,
    required this.group,
    required this.label,
    required this.icon,
    required this.class1Threshold,
    required this.class2Threshold,
  });
}

const kProjectTypes = [
  // 発電所
  ProjectType(
    value: 'wind', group: '発電所', label: '風力発電所', icon: '💨',
    class1Threshold: '出力50,000kW以上 または 海域内',
    class2Threshold: '出力22,500kW以上50,000kW未満',
  ),
  ProjectType(
    value: 'solar', group: '発電所', label: '太陽光発電所', icon: '☀️',
    class1Threshold: '出力250,000kW以上',
    class2Threshold: '出力100,000kW以上250,000kW未満',
  ),
  ProjectType(
    value: 'thermal', group: '発電所', label: '火力発電所', icon: '🔥',
    class1Threshold: '出力150,000kW以上',
    class2Threshold: '出力112,500kW以上',
  ),
  ProjectType(
    value: 'hydro', group: '発電所', label: '水力発電所', icon: '💧',
    class1Threshold: '出力30,000kW以上',
    class2Threshold: '出力22,500kW以上',
  ),
  ProjectType(
    value: 'geo', group: '発電所', label: '地熱発電所', icon: '🌋',
    class1Threshold: '出力10,000kW以上',
    class2Threshold: '出力7,500kW以上',
  ),
  ProjectType(
    value: 'nuclear', group: '発電所', label: '原子力発電所', icon: '⚛️',
    class1Threshold: '全て第一種事業',
    class2Threshold: '—',
  ),
  // インフラ
  ProjectType(
    value: 'road', group: 'インフラ', label: '道路', icon: '🛣️',
    class1Threshold: '4車線以上・延長10km以上',
    class2Threshold: '4車線以上・延長7.5km以上',
  ),
  ProjectType(
    value: 'rail', group: 'インフラ', label: '鉄道', icon: '🚄',
    class1Threshold: '新幹線 または 延長20km以上',
    class2Threshold: '延長15km以上',
  ),
  ProjectType(
    value: 'airport', group: 'インフラ', label: '飛行場', icon: '✈️',
    class1Threshold: '滑走路長2,500m以上',
    class2Threshold: '滑走路長1,875m以上',
  ),
  ProjectType(
    value: 'dam', group: 'インフラ', label: 'ダム・堰', icon: '🌊',
    class1Threshold: '貯水量6,000万m³以上 または 高さ100m以上',
    class2Threshold: '貯水量4,500万m³以上',
  ),
  ProjectType(
    value: 'river', group: 'インフラ', label: '河川工作物', icon: '🏞️',
    class1Threshold: '湖沼開発水位変動区域100ha以上',
    class2Threshold: '同75ha以上',
  ),
  ProjectType(
    value: 'port', group: 'インフラ', label: '港湾計画', icon: '⚓',
    class1Threshold: '埋立・掘込面積300ha以上',
    class2Threshold: '—（港湾計画は一律）',
  ),
  // 土地開発
  ProjectType(
    value: 'reclaim', group: '土地開発', label: '埋立・干拓', icon: '🏗️',
    class1Threshold: '面積50ha超',
    class2Threshold: '面積40ha以上50ha以下',
  ),
  ProjectType(
    value: 'housing', group: '土地開発', label: '新住宅市街地開発', icon: '🏘️',
    class1Threshold: '面積100ha以上',
    class2Threshold: '面積75ha以上',
  ),
  ProjectType(
    value: 'industry', group: '土地開発', label: '工業団地造成', icon: '🏭',
    class1Threshold: '面積100ha以上',
    class2Threshold: '面積75ha以上',
  ),
  ProjectType(
    value: 'landadj', group: '土地開発', label: '土地区画整理', icon: '📐',
    class1Threshold: '面積100ha以上',
    class2Threshold: '面積75ha以上',
  ),
  // 廃棄物
  ProjectType(
    value: 'waste', group: '廃棄物', label: '廃棄物最終処分場', icon: '♻️',
    class1Threshold: '面積30ha以上',
    class2Threshold: '面積25ha以上',
  ),
  // その他
  ProjectType(
    value: 'other', group: 'その他', label: 'その他（条例・個別判断）', icon: '📋',
    class1Threshold: '事業規模による',
    class2Threshold: '事業規模による',
  ),
];

ProjectType projectTypeOf(String value) =>
    kProjectTypes.firstWhere((t) => t.value == value,
        orElse: () => kProjectTypes.last);

// ─────────────────────────────────────────────────────────────────────────────
// 事業区分
// ─────────────────────────────────────────────────────────────────────────────
const kProjectClasses = {
  '1': '第一種事業（EIA必須）',
  '2': '第二種事業（スクリーニング）',
  'ordinance': '条例アセスのみ',
};

// ─────────────────────────────────────────────────────────────────────────────
// 調査種別テンプレート（法定タスク）
// 段階1=配慮書 2=方法書 3=現地調査 4=準備書 5=評価書 6=事後調査
// ─────────────────────────────────────────────────────────────────────────────
class SurveyTemplate {
  final String value;
  final String label;
  final String icon;
  final Map<int, List<String>> tasks;
  const SurveyTemplate({
    required this.value,
    required this.label,
    required this.icon,
    required this.tasks,
  });
}

const kSurveyTemplates = [
  SurveyTemplate(value: 'bio', label: '生物多様性調査', icon: '🦅', tasks: {
    1: [
      '事業の目的・内容・規模の整理',
      '対象地域の地形・土地利用・植生の把握（GIS・空中写真）',
      '既存文献・レッドリスト・自然環境保全基礎調査の収集',
      '生息地感度スクリーニング（デスクトップ調査）',
      '配慮書（生物多様性章）の作成',
      '主務大臣への配慮書提出（法第3条の7）',
      '都道府県知事への送付',
    ],
    2: [
      '調査対象種群の選定（基本的事項 別表準拠）',
      '調査手法・季節区分・調査地点の設計',
      '方法書の作成（法第5条）',
      '方法書の公告・縦覧 30日間（法第6条）',
      '説明会の開催（法第7条の2）',
      '住民意見書の受付・整理（法第8条）',
      '都道府県知事意見の受理（法第10条）',
      '方法書の最終確定',
    ],
    3: [
      '春季調査（植物・鳥類繁殖期：3〜6月）',
      '夏季調査（昆虫・両生類・爬虫類：7〜8月）',
      '秋季調査（哺乳類・植物結実期：9〜11月）',
      '冬季調査（越冬鳥類・魚類：12〜2月）',
      '猛禽類繁殖調査（年間定点観察）',
      '水生生物調査（魚類・底生生物・付着藻類）',
      '植生図の作成（1/2,500以上）',
      '全確認種のデータ整理・同定確認・写真整理',
    ],
    4: [
      '確認種データ集計・多様性指数の算出',
      '環境省・都道府県レッドリスト照合',
      '特定第二種国内希少野生動植物の確認',
      '植物：改変面積・個体数への影響予測',
      '動物：行動圏・移動経路・繁殖への影響予測',
      '生態系：上位性・典型性・特殊性の注目種評価',
      '保全措置の検討（回避→低減→代償の序列）',
      '準備書（生物多様性章）の作成（法第14条）',
      '準備書の公告・縦覧 30日間（法第16条）',
      '説明会の開催（法第17条）',
      '住民意見書の受付・整理（法第18条）',
      '都道府県知事意見の受理 4ヶ月以内（法第20条）',
      '事業者見解書の作成・送付',
    ],
    5: [
      '準備書の補正・評価書の作成（法第21条）',
      '評価書の主務大臣送付・環境大臣意見（法第22〜23条）',
      '評価書の補正・確定（法第25条）',
      '評価書の公告・縦覧（法第27条）',
      '許認可申請への評価書添付',
    ],
    6: [
      '事後調査計画の策定（法第38条の2準拠）',
      '重要種モニタリング調査（工事中・年1〜2回）',
      '植生回復・緑化の状況確認',
      '供用後モニタリング（3〜5年間・年1回）',
      '報告書の作成・公表',
      '保全措置の有効性評価・追加措置の検討',
    ],
  }),
  SurveyTemplate(value: 'noise', label: '騒音・振動調査', icon: '🔊', tasks: {
    1: [
      '事業概要・発生源の整理',
      '現地踏査・測定地点候補の選定',
      '既存騒音・振動データ収集（常時監視データ）',
      '要配慮施設（学校・病院・住宅）のリストアップ',
      '配慮書（騒音・振動章）の作成・提出',
    ],
    2: [
      'JIS Z 8731に基づく測定計画の策定',
      '騒音環境基準の地域類型・規制区域の確認',
      '測定機材の選定・校正計画',
      '方法書の作成・公告・縦覧（30日間）',
      '住民意見・知事意見の受理',
      '方法書の最終確定',
    ],
    3: [
      '等価騒音レベル（LAeq）測定（昼・夜・早朝）',
      '建設機械騒音の発生源測定',
      '道路交通騒音のロードサイド測定',
      '振動レベル測定（L10・鉛直方向）',
      '暗騒音・バックグラウンド測定（複数日）',
      '低周波音測定（必要に応じ）',
      'データ整理・QC・統計処理',
    ],
    4: [
      '工事騒音・振動の影響予測（伝搬計算）',
      '道路交通騒音予測（ASJ RTN-Model準拠）',
      '環境基準・規制基準との照合',
      '防音壁・低騒音型機械等の対策検討',
      '準備書（騒音・振動章）作成・公告・縦覧（30日間）',
      '住民意見・知事意見の受理',
      '事業者見解書の作成',
    ],
    5: [
      '評価書（騒音・振動章）の作成・補正',
      '主務大臣送付・環境大臣意見対応',
      '評価書の公告・縦覧',
    ],
    6: [
      '工事中騒音モニタリング（月1回以上）',
      '振動モニタリング（基準超過時は即時対応）',
      '苦情対応記録の管理',
      '供用後騒音モニタリング（年1回）',
      '報告書の作成・公表',
    ],
  }),
  SurveyTemplate(value: 'air', label: '大気質調査', icon: '🌫️', tasks: {
    1: [
      '気象・大気拡散条件の予備調査',
      '排出源・排出物質の特定（NOx・SOx・SPM・PM2.5）',
      '環境基準適用地域の確認',
      '配慮書（大気質章）の作成・提出',
    ],
    2: [
      '測定地点の選定（風上・風下・沿道）',
      '測定物質・気象観測計画の策定',
      '方法書の作成・公告・縦覧（30日間）',
      '住民意見・知事意見の受理',
    ],
    3: [
      '大気質の現地測定（季節別・年4回）',
      '気象観測（連続観測器）',
      '粉じん・悪臭調査',
      'データ整理・QC',
    ],
    4: [
      '大気拡散モデルによる影響予測',
      '環境基準・排出基準との照合',
      '低減措置の検討',
      '準備書作成・公告・縦覧（30日間）',
      '住民意見・知事意見・見解書',
    ],
    5: ['評価書の作成・補正', '主務大臣送付・確定', '公告・縦覧'],
    6: [
      '工事中粉じんモニタリング',
      '供用後大気質モニタリング（年1回）',
      '報告書の作成・公表',
    ],
  }),
  SurveyTemplate(value: 'river', label: '水質・河川調査', icon: '🏞️', tasks: {
    1: [
      '流域・集水域情報の収集',
      '水質環境基準（類型指定）の確認',
      '利水・治水の現状把握',
      '配慮書（水環境章）の作成・提出',
    ],
    2: [
      '調査断面・採水地点の設計',
      '水質測定項目の選定（河川水質測定指針準拠）',
      '方法書の作成・公告・縦覧（30日間）',
      '漁協・水利権者への事前説明',
      '住民意見・知事意見の受理',
    ],
    3: [
      '水質測定（BOD・COD・SS・DO等）',
      '流量・流速測定',
      '魚類・底生生物調査（春・秋）',
      '底質調査',
      '連続観測（水温・濁度）',
    ],
    4: [
      '環境基準との照合・水域生態系評価',
      '流況変化・水質影響の数値予測',
      '濁水処理等の保全措置検討',
      '準備書作成・公告・縦覧（30日間）',
      '住民意見・知事意見・見解書',
    ],
    5: ['評価書の作成・補正', '主務大臣送付・確定', '公告・縦覧'],
    6: [
      '工事中水質モニタリング（月2回以上）',
      '濁水・土砂流出の監視',
      '魚類等生息状況の追跡（年1回）',
      '報告書の作成・公表',
    ],
  }),
  SurveyTemplate(value: 'soil', label: '土壌汚染調査', icon: '🏜️', tasks: {
    1: [
      '土地利用履歴調査（地歴調査）',
      '汚染リスク物質・施設の特定（特定有害物質26種）',
      '調査計画書の作成・知事への提出（土対法第3・4条）',
    ],
    2: [
      'サンプリング設計（10m/30m格子）',
      '分析項目の選定（溶出量・含有量基準）',
      '指定調査機関の選定',
      '地下水モニタリング計画',
    ],
    3: [
      'ボーリング・土壌サンプリング（深度別）',
      '地下水サンプリング（観測井）',
      '土壌ガス調査（VOC）',
      '分析・QC確認',
    ],
    4: [
      '基準照合・汚染範囲の3次元マッピング',
      '汚染土量算定・健康リスク評価',
      '浄化工法の比較検討',
      '調査結果報告書の作成・知事提出',
    ],
    5: [
      '要措置区域等の指定対応',
      '浄化措置計画書の作成・提出（土対法）',
      '住民・地権者への説明',
    ],
    6: [
      '浄化工事中モニタリング（月1回）',
      '地下水ポストモニタリング（四半期）',
      '浄化完了確認・台帳更新',
    ],
  }),
  SurveyTemplate(value: 'asb', label: 'アスベスト調査', icon: '🏚️', tasks: {
    1: [
      '建物使用年代・建材の予備調査',
      '石綿含有建材図面・仕様書の収集',
      '分析機関の選定',
      '事前調査の届出（大防法第18条の15）',
    ],
    2: [
      '目視・書面調査計画（レベル1〜3別）',
      'サンプリング地点の選定',
      'JIS A 1481分析計画',
      '安全衛生計画（作業主任者・保護具）',
    ],
    3: [
      'レベル1（吹付け材）確認',
      'レベル2（保温材・断熱材）確認',
      'レベル3（成形板等）確認',
      'サンプリング・定量分析',
      '劣化度・飛散性リスク記録',
    ],
    4: [
      '石綿含有材料の総量集計',
      '除去・封じ込め工法の比較検討',
      '調査結果報告書の作成（建築物石綿含有建材調査者署名）',
    ],
    5: [
      '行政への報告書提出',
      '解体等作業の届出（石綿則・安衛法）',
      '住民説明',
    ],
    6: [
      '除去工事中の空気中石綿濃度測定',
      '廃棄物マニフェスト管理',
      'クリアランス検査・証明書発行',
      '記録の30年保管（石綿則第35条）',
    ],
  }),
  SurveyTemplate(value: 'eco', label: '生態系・TNFD調査', icon: '🌿', tasks: {
    1: [
      '広域生態系・緑地ネットワーク情報収集',
      '重要生態系（OECM・ラムサール等）確認',
      'TNFD LEAPアプローチ予備評価',
      '配慮書（生態系章）の作成・提出',
    ],
    2: [
      '生態系調査手法の設計',
      '上位性・典型性・特殊性の注目種選定',
      '生態系サービス評価指標の設定',
      '方法書の作成・公告・縦覧（30日間）',
      '住民意見・知事意見の受理',
    ],
    3: [
      '植生詳細調査（コドラート・植生図1/2,500）',
      '鳥類・哺乳類の行動圏・移動経路調査',
      '昆虫類（送粉者）多様性調査',
      '生態系機能評価（一次生産・炭素貯留）',
    ],
    4: [
      '生態系影響マトリクス作成',
      '生態系サービス影響の定量化',
      '生物多様性オフセット・NbSの検討',
      '準備書作成・公告・縦覧（30日間）',
      '住民意見・知事意見・見解書',
    ],
    5: [
      '評価書の作成・補正',
      'TNFD整合レポート作成',
      '主務大臣送付・確定・公告縦覧',
    ],
    6: [
      '生態系モニタリングの実施',
      '修復成果の定量検証',
      '年次報告書の作成・公表',
    ],
  }),
];

SurveyTemplate surveyTemplateOf(String value) =>
    kSurveyTemplates.firstWhere((t) => t.value == value,
        orElse: () => kSurveyTemplates.first);

// ─────────────────────────────────────────────────────────────────────────────
// 役割と権限
// ─────────────────────────────────────────────────────────────────────────────
enum UserRole { admin, pm, surveyor, viewer }

UserRole roleFromString(String? s) => switch (s) {
      'admin' => UserRole.admin,
      'pm' => UserRole.pm,
      'surveyor' => UserRole.surveyor,
      _ => UserRole.viewer,
    };

extension RolePermissions on UserRole {
  String get label => switch (this) {
        UserRole.admin => '管理者',
        UserRole.pm => 'プロジェクトマネージャー',
        UserRole.surveyor => '調査員',
        UserRole.viewer => '閲覧者',
      };

  /// プロジェクトの作成・削除・段階進行
  bool get canManageProjects =>
      this == UserRole.admin || this == UserRole.pm;

  /// タスク・種記録・文書のフィールド編集
  bool get canEditFieldData =>
      this == UserRole.admin || this == UserRole.pm || this == UserRole.surveyor;

  /// チーム・組織設定の管理
  bool get canManageTeam => this == UserRole.admin;

  /// 縦覧期間・法定期限の設定
  bool get canSetLegalDates =>
      this == UserRole.admin || this == UserRole.pm;
}

// ─────────────────────────────────────────────────────────────────────────────
// 都道府県
// ─────────────────────────────────────────────────────────────────────────────
const kPrefectures = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

/// 環境省 地方公共団体アセス制度一覧
const kLocalOrdinanceUrl =
    'https://www.env.go.jp/policy/assess/1-1jichitai/index.html';

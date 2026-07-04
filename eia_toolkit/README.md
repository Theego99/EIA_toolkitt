# EIAツールキット — Flutter版

環境影響評価（EIA）コンサルティング会社向け業務支援アプリ。
環境影響評価法・施行令・基本的事項に準拠した法定ワークフロー管理。

## 対応プラットフォーム

1つのコードベースから全てビルド可能:
- **iOS / Android** — 現場調査向けネイティブアプリ（オフライン完全対応）
- **Web** — オフィスでのブラウザ利用
- **Windows / macOS** — デスクトップアプリ

## 機能

### 法定ワークフロー
- **6段階の法定手続き**: 配慮書 → 方法書 → 現地調査 → 準備書 → 評価書 → 事後調査報告書
- **18の対象事業種**（施行令 別表準拠）: 発電所6種・インフラ6種・土地開発4種・廃棄物・その他
- **第一種/第二種事業の区分管理** — 事業種ごとの規模閾値を表示
- **縦覧期限の自動計算** — 縦覧開始日を設定すると30日の縦覧終了日と、準備書の知事意見期限（+4ヶ月）を自動算出。期限14日前から黄色、5日前から赤色で警告
- **法定タスクテンプレート7種** — 生物・騒音振動・大気・水質・土壌・アスベスト・生態系。各タスクに法条文参照付き
- **条例アセス確認リンク** — 環境省の地方公共団体一覧へ直接リンク

### オフラインファースト同期
- 全ての変更はまずローカル（Hive）に保存 → 即座にUI反映
- オンライン時はSupabaseへ直接書き込み、オフライン時はキューへ
- 接続回復時・10秒ごとのポーリングで自動同期
- Supabase Realtimeで他端末の変更を即時反映（自分の書き込みのエコーは抑制）
- IDは常にUUID（タイムスタンプID事故の構造的防止）

### 役割と権限
| 役割 | 案件作成/削除 | 段階進行 | 期限設定 | 現場データ編集 | チーム管理 |
|------|:---:|:---:|:---:|:---:|:---:|
| 管理者 (admin) | ✅ | ✅ | ✅ | ✅ | ✅ |
| PM (pm) | ✅ | ✅ | ✅ | ✅ | — |
| 調査員 (surveyor) | — | — | — | ✅ | — |
| 閲覧者 (viewer) | — | — | — | — | — |

権限はUI（RoleGateウィジェット）とサーバー（RLSポリシー）の二層で強制。

## セットアップ

### 1. Supabase（既存インスタンスをそのまま使用）

React版と同じSupabaseプロジェクト・スキーマを共有します。
追加で必要なのは役割ベースRLSのみ:

```
Supabase Dashboard → SQL Editor → supabase/migration_v3_roles.sql を実行
```

### 2. Flutter

```bash
# Flutter SDK 3.19+ が必要
flutter --version

# 依存パッケージ取得
flutter pub get

# lib/main.dart の supabaseAnonKey を自分の値に変更
# （Supabase Dashboard → Settings → API → anon public key）

# 実行
flutter run                    # 接続中のデバイス
flutter run -d chrome          # Web
flutter build apk              # Android リリースビルド
flutter build ios              # iOS（要Mac + Xcode）
flutter build web              # Web デプロイ用
```

### 3. メンバー招待の流れ

1. Supabase Dashboard → Authentication → Invite user でメール招待
2. profiles テーブルに organization_id を設定:
```sql
UPDATE profiles SET organization_id = '<org-uuid>', name = '名前', role = 'surveyor'
WHERE id = '<user-uuid>';
```
3. 以降の役割変更はアプリ内のチーム管理画面（管理者のみ）から可能

## アーキテクチャ

```
lib/
├── main.dart                    # エントリ + 認証ゲート
├── core/
│   ├── constants.dart           # 法定定数（段階・事業種・閾値・タスク）
│   └── theme.dart               # デザイントークン
├── models/
│   └── models.dart              # Project / Task / Species / Document / Comment
├── services/
│   ├── project_repository.dart  # オフラインファースト同期エンジン
│   └── providers.dart           # 認証 + Riverpodプロバイダ
├── screens/
│   ├── login_screen.dart
│   ├── dashboard_screen.dart    # 統計 + 法定期限アラート + 案件一覧
│   ├── new_project_screen.dart  # 2ステップ作成フロー
│   ├── project_detail_screen.dart  # タスク/法定期限/種記録/文書/コメント
│   └── team_screen.dart         # チーム管理（管理者）
└── widgets/
    └── shared.dart              # StageBar / ProjectCard / SyncBanner / RoleGate / JuranTracker
```

### 同期設計（React版の教訓を反映）

React版のデバッグで判明した3つの構造的問題を最初から排除:

1. **タイムスタンプID問題** → 全IDを `uuid.v4()` で生成。さらに起動時とキューフラッシュ時に数字のみIDのゾンビエントリを自動除去
2. **Realtimeエコー重複** → `recentlyWritten` セットで自分の書き込みを5秒間追跡し、エコーイベントを無視
3. **org_id欠落によるRLS拒否** → キューフラッシュ時にorg_idを補完してから送信。orgが未取得の場合はスキップして次回リトライ

## React版との互換性

同じSupabaseテーブル・スキーマを使うため、React版（Vercel）とFlutter版は同時運用可能。
どちらで変更してもRealtimeで相互に反映されます。移行期間中の併用も問題ありません。

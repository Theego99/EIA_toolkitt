// ─────────────────────────────────────────────────────────────────────────────
// EIAツールキット — ドメインロジックの単体テスト
// バックエンド（Supabase/Hive）に依存しない純粋関数を検証する。
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter_test/flutter_test.dart';

import 'package:eia_toolkit/core/constants.dart';

void main() {
  group('roleFromString', () {
    test('既知の役割文字列を正しく変換する', () {
      expect(roleFromString('admin'), UserRole.admin);
      expect(roleFromString('pm'), UserRole.pm);
      expect(roleFromString('surveyor'), UserRole.surveyor);
      expect(roleFromString('viewer'), UserRole.viewer);
    });

    test('未知・null は閲覧者にフォールバックする', () {
      expect(roleFromString(null), UserRole.viewer);
      expect(roleFromString('unknown'), UserRole.viewer);
      expect(roleFromString(''), UserRole.viewer);
    });
  });

  group('RolePermissions', () {
    test('管理者は全権限を持つ', () {
      expect(UserRole.admin.canManageProjects, isTrue);
      expect(UserRole.admin.canEditFieldData, isTrue);
      expect(UserRole.admin.canManageTeam, isTrue);
      expect(UserRole.admin.canSetLegalDates, isTrue);
    });

    test('PMはチーム管理以外の権限を持つ', () {
      expect(UserRole.pm.canManageProjects, isTrue);
      expect(UserRole.pm.canEditFieldData, isTrue);
      expect(UserRole.pm.canManageTeam, isFalse);
      expect(UserRole.pm.canSetLegalDates, isTrue);
    });

    test('調査員は現場データのみ編集できる', () {
      expect(UserRole.surveyor.canManageProjects, isFalse);
      expect(UserRole.surveyor.canEditFieldData, isTrue);
      expect(UserRole.surveyor.canManageTeam, isFalse);
      expect(UserRole.surveyor.canSetLegalDates, isFalse);
    });

    test('閲覧者は書き込み権限を持たない', () {
      expect(UserRole.viewer.canManageProjects, isFalse);
      expect(UserRole.viewer.canEditFieldData, isFalse);
      expect(UserRole.viewer.canManageTeam, isFalse);
      expect(UserRole.viewer.canSetLegalDates, isFalse);
    });
  });

  group('projectTypeOf', () {
    test('既知の事業種を返す', () {
      final wind = projectTypeOf('wind');
      expect(wind.value, 'wind');
      expect(wind.group, '発電所');
    });

    test('未知の値は「その他」にフォールバックする', () {
      expect(projectTypeOf('does-not-exist').value, 'other');
    });
  });

  group('surveyTemplateOf', () {
    test('既知テンプレートを返す', () {
      expect(surveyTemplateOf('noise').value, 'noise');
    });

    test('未知の値は最初のテンプレートにフォールバックする', () {
      expect(surveyTemplateOf('does-not-exist').value, kSurveyTemplates.first.value);
    });

    test('全テンプレートが6段階分のタスクを持つ', () {
      for (final t in kSurveyTemplates) {
        for (var stage = 1; stage <= 6; stage++) {
          expect(t.tasks[stage], isNotNull,
              reason: '${t.label} は段階$stage のタスクを持つべき');
          expect(t.tasks[stage], isNotEmpty);
        }
      }
    });
  });

  group('法定定数', () {
    test('縦覧期間・知事意見期限は法定日数と一致する', () {
      expect(kJuranDays, 30);
      expect(kGovernorOpinionDays, 120);
    });

    test('6段階が定義され、IDが1〜6で連番になっている', () {
      expect(kStages.length, 6);
      for (var i = 0; i < kStages.length; i++) {
        expect(kStages[i].id, i + 1);
      }
    });

    test('EiaStage は JSON ラウンドトリップで保持される', () {
      final original = kStages.first;
      final restored = EiaStage.fromJson(original.toJson());
      expect(restored.id, original.id);
      expect(restored.short, original.short);
      expect(restored.juran, original.juran);
      expect(restored.color, original.color);
    });
  });
}

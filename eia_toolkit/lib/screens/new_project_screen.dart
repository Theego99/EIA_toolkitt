// ─────────────────────────────────────────────────────────────────────────────
// 新規案件作成 — 2ステップ（基本情報 → 調査テンプレート選択）
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/project_repository.dart';
import '../services/providers.dart';

class NewProjectScreen extends ConsumerStatefulWidget {
  const NewProjectScreen({super.key});

  @override
  ConsumerState<NewProjectScreen> createState() => _NewProjectScreenState();
}

class _NewProjectScreenState extends ConsumerState<NewProjectScreen> {
  int _step = 0;

  final _name = TextEditingController();
  final _client = TextEditingController();
  final _area = TextEditingController();
  final _budget = TextEditingController();
  final _desc = TextEditingController();

  String _type = 'wind';
  String _pref = '東京都';
  String _projectClass = '1';
  String _risk = 'low';
  DateTime? _deadline;
  String _surveyType = 'bio';

  @override
  void dispose() {
    _name.dispose();
    _client.dispose();
    _area.dispose();
    _budget.dispose();
    _desc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final type = projectTypeOf(_type);

    return Scaffold(
      appBar: AppBar(
        title: Text(_step == 0 ? '新規案件 — 基本情報' : '新規案件 — 調査テンプレート'),
      ),
      body: _step == 0 ? _buildStep1(type) : _buildStep2(),
    );
  }

  // ── Step 1: 基本情報 ──
  Widget _buildStep1(ProjectType type) {
    final groups = <String, List<ProjectType>>{};
    for (final t in kProjectTypes) {
      groups.putIfAbsent(t.group, () => []).add(t);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _name,
          decoration: const InputDecoration(labelText: '案件名 *'),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _client,
          decoration: const InputDecoration(labelText: 'クライアント名'),
        ),
        const SizedBox(height: 14),

        // 事業種別（グループ化）
        DropdownButtonFormField<String>(
          value: _type,
          decoration: const InputDecoration(labelText: '事業種別（施行令準拠）'),
          items: [
            for (final g in groups.entries) ...[
              DropdownMenuItem(
                enabled: false,
                value: '__${g.key}',
                child: Text(g.key,
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: T.textMuted)),
              ),
              ...g.value.map((t) => DropdownMenuItem(
                    value: t.value,
                    child: Text('${t.icon} ${t.label}'),
                  )),
            ],
          ],
          onChanged: (v) {
            if (v != null && !v.startsWith('__')) setState(() => _type = v);
          },
        ),
        const SizedBox(height: 14),

        // 事業区分（第一種/第二種）
        const Text('事業区分（環境影響評価法）',
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: T.textMid)),
        const SizedBox(height: 8),
        ...kProjectClasses.entries.map((e) => RadioListTile<String>(
              value: e.key,
              groupValue: _projectClass,
              onChanged: (v) => setState(() => _projectClass = v!),
              title: Text(e.value, style: const TextStyle(fontSize: 14)),
              dense: true,
              activeColor: T.primary,
              contentPadding: EdgeInsets.zero,
            )),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: T.warm,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: T.borderLight),
          ),
          child: Text(
            '参考規模区分（${type.label}）\n'
            '第一種：${type.class1Threshold}\n'
            '第二種：${type.class2Threshold}',
            style: const TextStyle(fontSize: 12, color: T.textMuted),
          ),
        ),
        const SizedBox(height: 14),

        DropdownButtonFormField<String>(
          value: _pref,
          decoration: const InputDecoration(labelText: '都道府県'),
          items: kPrefectures
              .map((p) => DropdownMenuItem(value: p, child: Text(p)))
              .toList(),
          onChanged: (v) => setState(() => _pref = v!),
        ),
        const SizedBox(height: 14),

        // 完了期限
        OutlinedButton.icon(
          onPressed: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate:
                  _deadline ?? DateTime.now().add(const Duration(days: 365)),
              firstDate: DateTime.now(),
              lastDate: DateTime(2040),
            );
            if (picked != null) setState(() => _deadline = picked);
          },
          icon: const Icon(Icons.event),
          label: Text(_deadline == null
              ? '完了期限を設定'
              : '完了期限：${_deadline!.year}-${_deadline!.month.toString().padLeft(2, "0")}-${_deadline!.day.toString().padLeft(2, "0")}'),
        ),
        const SizedBox(height: 14),

        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _area,
                keyboardType: TextInputType.number,
                decoration:
                    const InputDecoration(labelText: '面積（ha）'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextField(
                controller: _budget,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '予算（円）'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        DropdownButtonFormField<String>(
          value: _risk,
          decoration: const InputDecoration(labelText: 'リスクレベル'),
          items: const [
            DropdownMenuItem(value: 'low', child: Text('低リスク')),
            DropdownMenuItem(value: 'medium', child: Text('中リスク')),
            DropdownMenuItem(value: 'high', child: Text('高リスク')),
          ],
          onChanged: (v) => setState(() => _risk = v!),
        ),
        const SizedBox(height: 14),

        TextField(
          controller: _desc,
          maxLines: 3,
          decoration: const InputDecoration(labelText: '事業概要'),
        ),
        const SizedBox(height: 24),

        ElevatedButton(
          onPressed: _name.text.trim().isEmpty
              ? null
              : () => setState(() => _step = 1),
          child: const Text('次へ：調査テンプレート選択'),
        ),
      ],
    );
  }

  // ── Step 2: 調査テンプレート ──
  Widget _buildStep2() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          '調査種別を選択すると、法定手続きに準拠したタスクが各段階に自動設定されます。',
          style: TextStyle(fontSize: 13, color: T.textMid),
        ),
        const SizedBox(height: 14),
        ...kSurveyTemplates.map((t) {
          final selected = _surveyType == t.value;
          final taskCount =
              t.tasks.values.fold<int>(0, (s, l) => s + l.length);
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              onTap: () => setState(() => _surveyType = t.value),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: selected ? T.light : T.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected ? T.primary : T.borderLight,
                    width: selected ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Text(t.icon, style: const TextStyle(fontSize: 26)),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t.label,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15)),
                          Text('全$taskCount タスク（6段階）',
                              style: const TextStyle(
                                  fontSize: 12, color: T.textMuted)),
                        ],
                      ),
                    ),
                    if (selected)
                      const Icon(Icons.check_circle, color: T.primary),
                  ],
                ),
              ),
            ),
          );
        }),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() => _step = 0),
                child: const Text('戻る'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: _create,
                child: const Text('案件を作成'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _create() {
    final template = surveyTemplateOf(_surveyType);
    final tasks = <int, List<TaskItem>>{};
    for (final s in kStages) {
      final labels = template.tasks[s.id] ?? [];
      tasks[s.id] = labels
          .asMap()
          .entries
          .map((e) => TaskItem(
              id: '${ProjectRepository.newId().substring(0, 8)}_${e.key}',
              label: e.value))
          .toList();
    }

    final project = Project(
      id: ProjectRepository.newId(), // 常にUUID
      name: _name.text.trim(),
      client: _client.text.trim(),
      type: _type,
      stage: 1,
      pref: _pref,
      deadline: _deadline != null
          ? '${_deadline!.year}-${_deadline!.month.toString().padLeft(2, "0")}-${_deadline!.day.toString().padLeft(2, "0")}'
          : null,
      area: _area.text.trim(),
      budget: _budget.text.trim(),
      desc: _desc.text.trim(),
      risk: _risk,
      projectClass: _projectClass,
      tasks: tasks,
    );

    ref.read(repositoryProvider).upsertProject(project);
    Navigator.pop(context);
  }
}

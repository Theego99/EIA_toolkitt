// ─────────────────────────────────────────────────────────────────────────────
// 案件詳細 — タスク / 法定期限 / 種記録 / 文書 / コメント
// ─────────────────────────────────────────────────────────────────────────────
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/project_repository.dart';
import '../services/providers.dart';
import '../widgets/shared.dart';

class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final project = ref.watch(selectedProjectProvider);
    if (project == null) {
      // 他端末で削除された場合など
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('この案件は削除されました')),
      );
    }

    return DefaultTabController(
      length: 5,
      child: Scaffold(
        appBar: AppBar(
          title: Text(project.name,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          bottom: const TabBar(
            isScrollable: true,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white60,
            indicatorColor: Colors.white,
            tabs: [
              Tab(text: 'タスク'),
              Tab(text: '法定期限'),
              Tab(text: '種記録'),
              Tab(text: '文書'),
              Tab(text: 'コメント'),
            ],
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: TabBarView(
                children: [
                  _TasksTab(project: project),
                  _LegalTab(project: project),
                  _SpeciesTab(project: project),
                  _DocumentsTab(project: project),
                  _CommentsTab(project: project),
                ],
              ),
            ),
            const SyncBanner(),
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════ タスク ═════════════════════════════════
class _TasksTab extends ConsumerWidget {
  final Project project;
  const _TasksTab({required this.project});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(authProvider).profile?.role ?? UserRole.viewer;
    final repo = ref.read(repositoryProvider);
    final stage = project.currentStage;
    final stageTasks = project.tasks[project.stage] ?? [];
    final doneCount = stageTasks.where((t) => t.done).length;
    final allDone = stageTasks.isNotEmpty && doneCount == stageTasks.length;
    final curIdx = project.currentStageIndex;
    final hasNext = curIdx < project.stages.length - 1;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 段階パイプライン
        StageBar(project: project, height: 9),
        const SizedBox(height: 16),

        // 現在の段階カード
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: stage.color.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: stage.color.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '第${curIdx + 1}段階：${stage.label}'
                          '${stage.statutory ? "" : "（法定外・実務フェーズ）"}',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: stage.color,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(stage.desc,
                            style: const TextStyle(
                                fontSize: 13, color: T.textMid)),
                      ],
                    ),
                  ),
                  Column(
                    children: [
                      Text('$doneCount/${stageTasks.length}',
                          style: TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              color: stage.color)),
                      const Text('完了',
                          style: TextStyle(
                              fontSize: 11, color: T.textMuted)),
                    ],
                  ),
                ],
              ),
              // 縦覧期限のインラインバナー
              if (stage.juran) ...[
                const SizedBox(height: 12),
                _JuranInline(project: project),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),

        // タスクチェックリスト
        ...stageTasks.map((task) => CheckboxListTile(
              value: task.done,
              onChanged: role.canEditFieldData
                  ? (v) {
                      task.done = v ?? false;
                      repo.upsertProject(project);
                    }
                  : null,
              title: Text(
                task.label,
                style: TextStyle(
                  fontSize: 14,
                  decoration:
                      task.done ? TextDecoration.lineThrough : null,
                  color: task.done ? T.textMuted : T.text,
                ),
              ),
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            )),

        // 段階を進める
        if (allDone && hasNext)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: RoleGate(
              allow: (r) => r.canManageProjects,
              fallback: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: T.light,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  '✅ 全タスク完了。段階進行はPM・管理者が行います。',
                  style: TextStyle(fontSize: 13, color: T.mid),
                ),
              ),
              child: ElevatedButton.icon(
                onPressed: () {
                  final next = project.stages[curIdx + 1];
                  project.stage = next.id;
                  repo.upsertProject(project);
                },
                icon: const Icon(Icons.arrow_forward),
                label: Text(
                    '次の段階へ進む（${project.stages[curIdx + 1].label}）'),
              ),
            ),
          ),
        const SizedBox(height: 40),
      ],
    );
  }
}

class _JuranInline extends ConsumerWidget {
  final Project project;
  const _JuranInline({required this.project});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final end = project.juranEndDate(project.stage);
    if (end == null) {
      return Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: project.currentStage.color.withValues(alpha: 0.5),
              style: BorderStyle.solid),
        ),
        child: const Text(
          '📅 縦覧開始日を「法定期限」タブで設定すると期限が自動計算されます',
          style: TextStyle(fontSize: 12, color: T.textMid),
        ),
      );
    }
    final daysLeft = end.difference(DateTime.now()).inDays;
    final gov = project.governorOpinionDeadline();
    final fmt = DateFormat('yyyy-MM-dd');

    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: daysLeft < 0
                ? T.borderLight
                : daysLeft <= 5
                    ? T.redLight
                    : daysLeft <= 14
                        ? T.amberLight
                        : Colors.white.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            '📋 縦覧終了：${fmt.format(end)}'
            '${daysLeft < 0 ? "（終了済）" : "（残$daysLeft日）"}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: daysLeft < 0
                  ? T.textMuted
                  : daysLeft <= 5
                      ? T.red
                      : daysLeft <= 14
                          ? T.amber
                          : T.textMid,
            ),
          ),
        ),
        if (gov != null)
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: T.purpleLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '🏛️ 知事意見期限：${fmt.format(gov)}',
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: T.purple),
            ),
          ),
      ],
    );
  }
}

// ═════════════════════════════════ 法定期限 ═══════════════════════════════
class _LegalTab extends ConsumerWidget {
  final Project project;
  const _LegalTab({required this.project});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(repositoryProvider);
    final type = projectTypeOf(project.type);
    final role = ref.watch(authProvider).profile?.role ?? UserRole.viewer;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 事業区分
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('事業区分',
                    style: TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: kProjectClasses.entries
                      .map((e) => ChoiceChip(
                            label: Text(e.value.split('（').first,
                                style: const TextStyle(fontSize: 12)),
                            selected: project.projectClass == e.key,
                            selectedColor: T.primary,
                            labelStyle: TextStyle(
                              color: project.projectClass == e.key
                                  ? Colors.white
                                  : T.textMid,
                            ),
                            onSelected: role.canSetLegalDates
                                ? (sel) {
                                    if (sel) {
                                      project.projectClass = e.key;
                                      repo.upsertProject(project);
                                    }
                                  }
                                : null,
                          ))
                      .toList(),
                ),
                const SizedBox(height: 10),
                Text(
                  '参考規模区分（${type.label}）\n'
                  '第一種：${type.class1Threshold}\n'
                  '第二種：${type.class2Threshold}',
                  style:
                      const TextStyle(fontSize: 12, color: T.textMuted),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),

        // 縦覧トラッカー
        const Text('公告縦覧・法定期限管理',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
        const SizedBox(height: 10),
        JuranTracker(
          project: project,
          onUpdate: (p) => repo.upsertProject(p),
        ),

        // 条例リンク
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: T.amberLight,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: T.amber.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '⚖️ ${project.pref}の条例アセス確認',
                style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                    color: T.amber),
              ),
              const SizedBox(height: 4),
              const Text(
                '都道府県・政令市は独自の環境アセスメント条例を持つ場合があります。法アセス対象外でも条例対象となることがあるため必ず確認してください。',
                style: TextStyle(fontSize: 12, color: T.textMid),
              ),
              TextButton.icon(
                onPressed: () =>
                    launchUrl(Uri.parse(kLocalOrdinanceUrl)),
                icon: const Icon(Icons.open_in_new, size: 14),
                label: const Text('環境省 地方公共団体アセス一覧',
                    style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 40),
      ],
    );
  }
}

// ═════════════════════════════════ 種記録 ═════════════════════════════════
class _SpeciesTab extends ConsumerWidget {
  final Project project;
  const _SpeciesTab({required this.project});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(authProvider).profile?.role ?? UserRole.viewer;
    final repo = ref.read(repositoryProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: project.species.isEmpty
          ? const Center(
              child: Text('確認種の記録がまだありません',
                  style: TextStyle(color: T.textMuted)))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: project.species.length,
              itemBuilder: (_, i) {
                final s = project.species[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: Container(
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: s.isRedListed ? T.redLight : T.light,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        s.redListStatus,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                          color: s.isRedListed ? T.red : T.mid,
                        ),
                      ),
                    ),
                    title: Text(s.name,
                        style:
                            const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                      [
                        if (s.scientificName.isNotEmpty) s.scientificName,
                        if (s.category.isNotEmpty) s.category,
                        if (s.location.isNotEmpty) s.location,
                        if (s.date.isNotEmpty) s.date,
                      ].join(' ・ '),
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: role.canEditFieldData
                        ? IconButton(
                            icon: const Icon(Icons.delete_outline,
                                size: 20),
                            onPressed: () {
                              project.species.removeAt(i);
                              repo.upsertProject(project);
                            },
                          )
                        : null,
                  ),
                );
              },
            ),
      floatingActionButton: role.canEditFieldData
          ? FloatingActionButton(
              backgroundColor: T.primary,
              foregroundColor: Colors.white,
              onPressed: () => _showAddSpecies(context, repo),
              child: const Icon(Icons.add),
            )
          : null,
    );
  }

  void _showAddSpecies(BuildContext context, dynamic repo) {
    final name = TextEditingController();
    final sci = TextEditingController();
    final loc = TextEditingController();
    String category = '鳥類';
    String rl = '—';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 16,
          right: 16,
          top: 16,
        ),
        child: StatefulBuilder(
          builder: (ctx, setSt) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('確認種を追加',
                  style: TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 14),
              TextField(
                  controller: name,
                  decoration:
                      const InputDecoration(labelText: '和名 *')),
              const SizedBox(height: 10),
              TextField(
                  controller: sci,
                  decoration: const InputDecoration(labelText: '学名')),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: category,
                      decoration:
                          const InputDecoration(labelText: '分類群'),
                      items: ['鳥類', '哺乳類', '両生類', '爬虫類', '魚類', '昆虫類', '植物', 'その他']
                          .map((c) =>
                              DropdownMenuItem(value: c, child: Text(c)))
                          .toList(),
                      onChanged: (v) => setSt(() => category = v!),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: rl,
                      decoration: const InputDecoration(
                          labelText: 'レッドリスト'),
                      items: ['—', 'CR', 'EN', 'VU', 'NT', 'LC']
                          .map((c) =>
                              DropdownMenuItem(value: c, child: Text(c)))
                          .toList(),
                      onChanged: (v) => setSt(() => rl = v!),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                  controller: loc,
                  decoration:
                      const InputDecoration(labelText: '確認地点')),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  if (name.text.trim().isEmpty) return;
                  project.species.add(SpeciesRecord(
                    id: ProjectRepository.newId(),
                    name: name.text.trim(),
                    scientificName: sci.text.trim(),
                    category: category,
                    redListStatus: rl,
                    location: loc.text.trim(),
                    date: DateFormat('yyyy-MM-dd').format(DateTime.now()),
                  ));
                  repo.upsertProject(project);
                  Navigator.pop(ctx);
                },
                child: const Text('追加'),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

// ═════════════════════════════════ 文書 ═══════════════════════════════════
class _DocumentsTab extends ConsumerWidget {
  final Project project;
  const _DocumentsTab({required this.project});

  static const _statuses = ['作業中', 'レビュー中', '承認済', '提出済', '却下'];

  Color _statusColor(String s) => switch (s) {
        '承認済' => T.mid,
        '提出済' => T.blue,
        'レビュー中' => T.amber,
        '却下' => T.red,
        _ => T.textMuted,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(authProvider).profile?.role ?? UserRole.viewer;
    final repo = ref.read(repositoryProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: project.documents.isEmpty
          ? const Center(
              child: Text('文書がまだありません',
                  style: TextStyle(color: T.textMuted)))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: project.documents.length,
              itemBuilder: (_, i) {
                final d = project.documents[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: const Icon(Icons.description_outlined),
                    title: Text(d.name,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    subtitle: Text(
                        '${d.uploadedBy} ・ ${d.uploadedAt.split("T").first}',
                        style: const TextStyle(fontSize: 12)),
                    trailing: role.canEditFieldData
                        ? PopupMenuButton<String>(
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: _statusColor(d.status)
                                    .withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(d.status,
                                  style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: _statusColor(d.status))),
                            ),
                            onSelected: (v) {
                              project.documents[i] = d.copyWith(status: v);
                              repo.upsertProject(project);
                            },
                            itemBuilder: (_) => _statuses
                                .map((s) => PopupMenuItem(
                                    value: s, child: Text(s)))
                                .toList(),
                          )
                        : Text(d.status,
                            style: TextStyle(
                                fontSize: 12,
                                color: _statusColor(d.status))),
                    onTap: d.url.isNotEmpty
                        ? () => launchUrl(Uri.parse(d.url))
                        : null,
                  ),
                );
              },
            ),
      floatingActionButton: role.canEditFieldData
          ? FloatingActionButton(
              backgroundColor: T.primary,
              foregroundColor: Colors.white,
              onPressed: () => _upload(context, ref),
              child: const Icon(Icons.upload_file),
            )
          : null,
    );
  }

  Future<void> _upload(BuildContext context, WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(withData: true);
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final bytes = file.bytes;
    if (bytes == null) return;

    final sb = ref.read(supabaseProvider);
    final repo = ref.read(repositoryProvider);
    final profile = ref.read(authProvider).profile;

    final path =
        '${project.id}/${DateTime.now().millisecondsSinceEpoch}_${file.name}';

    String url = '';
    try {
      await sb.storage.from('project-docs').uploadBinary(path, bytes);
      url = sb.storage.from('project-docs').getPublicUrl(path);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('アップロード失敗（オフライン時は文書メタのみ保存）: $e')));
      }
    }

    project.documents.add(ProjectDocument(
      id: ProjectRepository.newId(),
      name: file.name,
      size: file.size,
      url: url,
      uploadedBy: profile?.name ?? '',
      uploadedAt: DateTime.now().toIso8601String(),
      stage: project.stage,
    ));
    repo.upsertProject(project);
  }
}

// ═════════════════════════════════ コメント ═══════════════════════════════
class _CommentsTab extends ConsumerStatefulWidget {
  final Project project;
  const _CommentsTab({required this.project});

  @override
  ConsumerState<_CommentsTab> createState() => _CommentsTabState();
}

class _CommentsTabState extends ConsumerState<_CommentsTab> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(authProvider).profile;
    final repo = ref.read(repositoryProvider);
    final comments = widget.project.comments.reversed.toList();

    return Column(
      children: [
        Expanded(
          child: comments.isEmpty
              ? const Center(
                  child: Text('コメントがまだありません',
                      style: TextStyle(color: T.textMuted)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: comments.length,
                  itemBuilder: (_, i) {
                    final c = comments[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: T.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: T.borderLight),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(c.author,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13)),
                              const SizedBox(width: 8),
                              Text(c.date,
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: T.textFaint)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(c.text,
                              style: const TextStyle(fontSize: 14)),
                        ],
                      ),
                    );
                  },
                ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: const InputDecoration(
                        hintText: 'コメントを入力…'),
                    onSubmitted: (_) => _post(repo, profile),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  style: IconButton.styleFrom(
                      backgroundColor: T.primary,
                      foregroundColor: Colors.white),
                  onPressed: () => _post(repo, profile),
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _post(dynamic repo, UserProfile? profile) {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    widget.project.comments.add(ProjectComment(
      id: ProjectRepository.newId(),
      text: text,
      author: profile?.name ?? '',
      date: DateFormat('yyyy-MM-dd HH:mm').format(DateTime.now()),
      role: profile?.role.name ?? '',
    ));
    repo.upsertProject(widget.project);
    _controller.clear();
    setState(() {});
  }
}

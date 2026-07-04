// ─────────────────────────────────────────────────────────────────────────────
// ダッシュボード — 案件一覧・統計・新規作成
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/providers.dart';
import '../widgets/shared.dart';
import 'new_project_screen.dart';
import 'project_detail_screen.dart';
import 'team_screen.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

enum _Sort { deadline, name, progress, stage }

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  String _query = '';
  int? _stageFilter; // null = 全段階
  _Sort _sort = _Sort.deadline;

  bool get _isFiltering => _query.trim().isNotEmpty || _stageFilter != null;

  /// 検索・フィルタ・並べ替えを適用した案件リスト
  List<Project> _visible(List<Project> all) {
    final q = _query.trim().toLowerCase();
    var list = all.where((p) {
      if (_stageFilter != null && p.stage != _stageFilter) return false;
      if (q.isEmpty) return true;
      return p.name.toLowerCase().contains(q) ||
          p.client.toLowerCase().contains(q) ||
          p.pref.toLowerCase().contains(q) ||
          projectTypeOf(p.type).label.toLowerCase().contains(q);
    }).toList();

    int byDeadline(Project a, Project b) {
      final da = a.deadline, db = b.deadline;
      if (da == null && db == null) return a.name.compareTo(b.name);
      if (da == null) return 1; // 期限なしは末尾
      if (db == null) return -1;
      return da.compareTo(db);
    }

    switch (_sort) {
      case _Sort.deadline:
        list.sort(byDeadline);
      case _Sort.name:
        list.sort((a, b) => a.name.compareTo(b.name));
      case _Sort.progress:
        list.sort((a, b) => b.overallProgress.compareTo(a.overallProgress));
      case _Sort.stage:
        list.sort((a, b) => a.stage.compareTo(b.stage));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final projects = ref.watch(projectsProvider).valueOrNull ?? [];
    final profile = ref.watch(authProvider).profile;
    final role = profile?.role ?? UserRole.viewer;
    final visible = _visible(projects);

    // 法定期限が近い案件の抽出
    final urgent = <(Project, String, int)>[];
    for (final p in projects) {
      for (final s in p.stages.where((s) => s.juran)) {
        final end = p.juranEndDate(s.id);
        if (end != null) {
          final d = end.difference(DateTime.now()).inDays;
          if (d >= 0 && d <= 14) {
            urgent.add((p, '${s.short}縦覧終了', d));
          }
        }
      }
      final gov = p.governorOpinionDeadline();
      if (gov != null) {
        final d = gov.difference(DateTime.now()).inDays;
        if (d >= 0 && d <= 30) urgent.add((p, '知事意見期限', d));
      }
    }
    urgent.sort((a, b) => a.$3.compareTo(b.$3));

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('EIAツールキット',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            if (profile?.orgName != null)
              Text(profile!.orgName!,
                  style: const TextStyle(fontSize: 12, color: Colors.white70)),
          ],
        ),
        actions: [
          if (role.canManageTeam)
            IconButton(
              icon: const Icon(Icons.group_outlined),
              tooltip: 'チーム管理',
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const TeamScreen()),
              ),
            ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.account_circle_outlined),
            onSelected: (v) {
              if (v == 'logout') {
                ref.read(authProvider.notifier).signOut();
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile?.name ?? '',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, color: T.text)),
                    Text(role.label,
                        style: const TextStyle(
                            fontSize: 12, color: T.textMuted)),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                  value: 'logout', child: Text('ログアウト')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: RefreshIndicator(
              onRefresh: () =>
                  ref.read(repositoryProvider).loadFromServer(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ── 統計 ──
                  Row(
                    children: [
                      _StatCard(
                        label: '進行中案件',
                        value: '${projects.length}',
                        color: T.primary,
                      ),
                      const SizedBox(width: 10),
                      _StatCard(
                        label: 'RL確認種',
                        value:
                            '${projects.fold<int>(0, (s, p) => s + p.redListCount)}',
                        color: T.red,
                      ),
                      const SizedBox(width: 10),
                      _StatCard(
                        label: '期限注意',
                        value: '${urgent.length}',
                        color: urgent.isEmpty ? T.mid : T.amber,
                      ),
                    ],
                  ),

                  // ── 法定期限アラート ──
                  if (urgent.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: T.amberLight,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: T.amber.withValues(alpha: 0.3)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('⚖️ 法定期限アラート',
                              style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                  color: T.amber)),
                          const SizedBox(height: 8),
                          ...urgent.take(5).map((u) => Padding(
                                padding:
                                    const EdgeInsets.only(bottom: 4),
                                child: Text(
                                  '${u.$1.name} — ${u.$2}（残${u.$3}日）',
                                  style: const TextStyle(
                                      fontSize: 13, color: T.textMid),
                                ),
                              )),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      const Text('案件一覧',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: T.text)),
                      const SizedBox(width: 8),
                      if (projects.isNotEmpty)
                        Text(
                          _isFiltering
                              ? '${visible.length} / ${projects.length}件'
                              : '${projects.length}件',
                          style: const TextStyle(
                              fontSize: 12, color: T.textMuted),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // ── 検索・フィルタ・並べ替え ──
                  if (projects.isNotEmpty) ...[
                    TextField(
                      onChanged: (v) => setState(() => _query = v),
                      decoration: InputDecoration(
                        isDense: true,
                        hintText: '案件名・顧客・都道府県・事業種で検索',
                        prefixIcon: const Icon(Icons.search, size: 20),
                        suffixIcon: _query.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close, size: 18),
                                onPressed: () =>
                                    setState(() => _query = ''),
                              ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _FilterDropdown<int?>(
                            icon: Icons.timeline,
                            value: _stageFilter,
                            items: [
                              const DropdownMenuItem(
                                  value: null, child: Text('全段階')),
                              ...kStages.map((s) => DropdownMenuItem(
                                  value: s.id, child: Text(s.short))),
                            ],
                            onChanged: (v) =>
                                setState(() => _stageFilter = v),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _FilterDropdown<_Sort>(
                            icon: Icons.sort,
                            value: _sort,
                            items: const [
                              DropdownMenuItem(
                                  value: _Sort.deadline,
                                  child: Text('締切が近い順')),
                              DropdownMenuItem(
                                  value: _Sort.stage, child: Text('段階順')),
                              DropdownMenuItem(
                                  value: _Sort.progress,
                                  child: Text('進捗が高い順')),
                              DropdownMenuItem(
                                  value: _Sort.name, child: Text('名前順')),
                            ],
                            onChanged: (v) =>
                                setState(() => _sort = v ?? _Sort.deadline),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                  ],

                  if (projects.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(40),
                      alignment: Alignment.center,
                      child: Column(
                        children: [
                          const Text('📋', style: TextStyle(fontSize: 40)),
                          const SizedBox(height: 12),
                          const Text('案件がまだありません',
                              style: TextStyle(color: T.textMuted)),
                          if (role.canManageProjects) ...[
                            const SizedBox(height: 6),
                            const Text('右下のボタンから新規案件を作成してください',
                                style: TextStyle(
                                    fontSize: 12, color: T.textFaint)),
                          ],
                        ],
                      ),
                    )
                  else if (visible.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(40),
                      alignment: Alignment.center,
                      child: Column(
                        children: [
                          const Text('🔍', style: TextStyle(fontSize: 36)),
                          const SizedBox(height: 12),
                          const Text('条件に一致する案件がありません',
                              style: TextStyle(color: T.textMuted)),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => setState(() {
                              _query = '';
                              _stageFilter = null;
                            }),
                            child: const Text('フィルタをクリア'),
                          ),
                        ],
                      ),
                    )
                  else
                    ...visible.map((p) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: ProjectCard(
                            project: p,
                            onTap: () {
                              ref
                                  .read(selectedProjectIdProvider.notifier)
                                  .state = p.id;
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) =>
                                        const ProjectDetailScreen()),
                              );
                            },
                            onDelete: role.canManageProjects
                                ? () => _confirmDelete(context, ref, p)
                                : null,
                          ),
                        )),
                  const SizedBox(height: 80),
                ],
              ),
            ),
          ),
          const SyncBanner(),
        ],
      ),
      floatingActionButton: role.canManageProjects
          ? FloatingActionButton.extended(
              backgroundColor: T.primary,
              foregroundColor: Colors.white,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const NewProjectScreen()),
              ),
              icon: const Icon(Icons.add),
              label: const Text('新規案件',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            )
          : null,
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref, Project p) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('案件を削除'),
        content: Text('「${p.name}」を削除します。この操作は取り消せません。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () {
              ref.read(repositoryProvider).deleteProject(p.id);
              Navigator.pop(ctx);
            },
            style: TextButton.styleFrom(foregroundColor: T.red),
            child: const Text('削除する'),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _StatCard(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: T.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: T.borderLight),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value,
                  style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: color)),
              Text(label,
                  style:
                      const TextStyle(fontSize: 11, color: T.textMuted)),
            ],
          ),
        ),
      );
}

/// コンパクトなフィルタ・並べ替えドロップダウン
class _FilterDropdown<V> extends StatelessWidget {
  final IconData icon;
  final V value;
  final List<DropdownMenuItem<V>> items;
  final ValueChanged<V?> onChanged;
  const _FilterDropdown({
    required this.icon,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: T.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: T.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: T.textMuted),
            const SizedBox(width: 6),
            Expanded(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<V>(
                  value: value,
                  isExpanded: true,
                  isDense: true,
                  style: const TextStyle(fontSize: 13, color: T.text),
                  items: items,
                  onChanged: onChanged,
                ),
              ),
            ),
          ],
        ),
      );
}

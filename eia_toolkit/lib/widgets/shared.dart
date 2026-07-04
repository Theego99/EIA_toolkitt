// ─────────────────────────────────────────────────────────────────────────────
// 共有ウィジェット
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../services/providers.dart';

// ── 段階バー（プロジェクト固有の段階数に対応）────────────────────────────
class StageBar extends StatelessWidget {
  final Project project;
  final double height;
  const StageBar({super.key, required this.project, this.height = 7});

  @override
  Widget build(BuildContext context) {
    final stages = project.stages;
    final curIdx = project.currentStageIndex;
    return Row(
      children: [
        ...stages.asMap().entries.map((e) {
          final active = e.key <= curIdx;
          return Expanded(
            child: Container(
              height: height,
              margin: const EdgeInsets.symmetric(horizontal: 1.5),
              decoration: BoxDecoration(
                color: active ? e.value.color : T.borderLight,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          );
        }),
        const SizedBox(width: 8),
        Text(
          '${curIdx + 1}/${stages.length}',
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: T.textMuted,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

// ── プロジェクトカード ──────────────────────────────────────────────────
class ProjectCard extends StatelessWidget {
  final Project project;
  final VoidCallback onTap;
  final VoidCallback? onDelete;
  const ProjectCard({
    super.key,
    required this.project,
    required this.onTap,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final type = projectTypeOf(project.type);
    final stage = project.currentStage;
    final deadline = project.deadline != null && project.deadline!.isNotEmpty
        ? DateTime.tryParse(project.deadline!)
        : null;
    final daysToDeadline =
        deadline?.difference(DateTime.now()).inDays;

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(type.icon, style: const TextStyle(fontSize: 22)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          project.name,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: T.text,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${project.client} ・ ${project.pref}',
                          style: const TextStyle(
                              fontSize: 12, color: T.textMuted),
                        ),
                      ],
                    ),
                  ),
                  if (onDelete != null)
                    IconButton(
                      icon: const Icon(Icons.delete_outline,
                          size: 20, color: T.textMuted),
                      onPressed: onDelete,
                      tooltip: '削除',
                    ),
                ],
              ),
              const SizedBox(height: 12),
              StageBar(project: project),
              const SizedBox(height: 10),
              Row(
                children: [
                  _Chip(
                    label: stage.short,
                    color: stage.color,
                  ),
                  const SizedBox(width: 6),
                  _Chip(
                    label: kProjectClasses[project.projectClass]
                            ?.split('（')
                            .first ??
                        '第一種事業',
                    color: T.textMid,
                  ),
                  if (project.redListCount > 0) ...[
                    const SizedBox(width: 6),
                    _Chip(
                      label: 'RL ${project.redListCount}種',
                      color: T.red,
                    ),
                  ],
                  const Spacer(),
                  if (daysToDeadline != null)
                    Text(
                      daysToDeadline < 0
                          ? '期限超過'
                          : '残$daysToDeadline日',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: daysToDeadline < 30
                            ? T.red
                            : daysToDeadline < 90
                                ? T.amber
                                : T.textMuted,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  const _Chip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      );
}

// ── オフライン/同期バナー ────────────────────────────────────────────────
class SyncBanner extends ConsumerWidget {
  const SyncBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(syncStatusProvider).valueOrNull;
    if (status == null) return const SizedBox.shrink();
    if (status.online && status.pending == 0 && !status.syncing) {
      return const SizedBox.shrink();
    }

    final Color bg;
    final String text;
    final IconData icon;

    if (!status.online) {
      bg = T.red;
      text = 'オフライン — 変更はローカルに保存されます（${status.pending}件待機中）';
      icon = Icons.cloud_off;
    } else if (status.syncing) {
      bg = T.mid;
      text = '同期中…';
      icon = Icons.sync;
    } else {
      bg = T.amber;
      text = '未同期の変更：${status.pending}件';
      icon = Icons.cloud_queue;
    }

    return Material(
      color: bg,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, size: 16),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  text,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600),
                ),
              ),
              if (status.online && status.pending > 0 && !status.syncing)
                TextButton(
                  onPressed: () =>
                      ref.read(repositoryProvider).flushQueue(),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  ),
                  child: const Text('今すぐ同期',
                      style: TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── 権限ゲート ──────────────────────────────────────────────────────────
/// 権限がない場合は子を非表示（またはdisabledで表示）にする
class RoleGate extends ConsumerWidget {
  final bool Function(UserRole role) allow;
  final Widget child;
  final Widget? fallback;
  const RoleGate({
    super.key,
    required this.allow,
    required this.child,
    this.fallback,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role =
        ref.watch(authProvider).profile?.role ?? UserRole.viewer;
    return allow(role) ? child : (fallback ?? const SizedBox.shrink());
  }
}

// ── 縦覧期限トラッカー ──────────────────────────────────────────────────
class JuranTracker extends ConsumerWidget {
  final Project project;
  final void Function(Project) onUpdate;
  const JuranTracker(
      {super.key, required this.project, required this.onUpdate});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(authProvider).profile?.role ?? UserRole.viewer;
    final fmt = DateFormat('yyyy-MM-dd');
    final juranStages = project.stages.where((s) => s.juran).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: juranStages.map((s) {
        final key = 'juran_${s.id}';
        final startStr = project.juranDates[key];
        final start =
            startStr != null ? DateTime.tryParse(startStr) : null;
        final end = start?.add(const Duration(days: kJuranDays));
        final daysLeft = end?.difference(DateTime.now()).inDays;
        final govDeadline = s.id == 4 && end != null
            ? end.add(const Duration(days: kGovernorOpinionDays))
            : null;
        final govDaysLeft =
            govDeadline?.difference(DateTime.now()).inDays;

        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: T.warm,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: s.id == project.stage
                  ? s.color.withValues(alpha: 0.4)
                  : T.borderLight,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '第${s.id}段階 ${s.label} — 公告縦覧（30日間）',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: s.color,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('縦覧開始日：',
                      style: TextStyle(fontSize: 13, color: T.textMid)),
                  TextButton.icon(
                    onPressed: role.canSetLegalDates
                        ? () async {
                            final picked = await showDatePicker(
                              context: context,
                              initialDate: start ?? DateTime.now(),
                              firstDate: DateTime(2020),
                              lastDate: DateTime(2035),
                            );
                            if (picked != null) {
                              final updated = project
                                ..juranDates[key] = fmt.format(picked);
                              onUpdate(updated);
                            }
                          }
                        : null,
                    icon: const Icon(Icons.calendar_today, size: 14),
                    label: Text(
                      start != null ? fmt.format(start) : '未設定',
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
              if (end != null) ...[
                Text(
                  '縦覧終了：${fmt.format(end)}'
                  '${daysLeft != null ? (daysLeft < 0 ? "（終了済）" : "（残$daysLeft日）") : ""}',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: daysLeft == null || daysLeft < 0
                        ? T.textMuted
                        : daysLeft <= 5
                            ? T.red
                            : daysLeft <= 14
                                ? T.amber
                                : T.textMid,
                  ),
                ),
                if (govDeadline != null)
                  Text(
                    '知事意見期限：${fmt.format(govDeadline)}'
                    '${govDaysLeft != null ? (govDaysLeft < 0 ? "（期限終了）" : "（残$govDaysLeft日）") : ""}'
                    '　※縦覧終了後4ヶ月',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: govDaysLeft == null || govDaysLeft < 0
                          ? T.textMuted
                          : govDaysLeft <= 30
                              ? T.red
                              : T.purple,
                    ),
                  ),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }
}

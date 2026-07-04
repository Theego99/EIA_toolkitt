// ─────────────────────────────────────────────────────────────────────────────
// チーム管理（管理者のみ）— メンバー一覧・役割変更・招待
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../services/providers.dart';

class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key});

  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> {
  List<Map<String, dynamic>> _members = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final sb = ref.read(supabaseProvider);
    final orgId = ref.read(authProvider).profile?.orgId;
    if (orgId == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final rows = await sb
          .from('profiles')
          .select()
          .eq('organization_id', orgId)
          .order('name');
      setState(() {
        _members = List<Map<String, dynamic>>.from(rows as List);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _changeRole(String userId, String newRole) async {
    final sb = ref.read(supabaseProvider);
    try {
      await sb.from('profiles').update({'role': newRole}).eq('id', userId);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('役割を更新しました')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('更新失敗: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(authProvider).profile;

    return Scaffold(
      appBar: AppBar(title: const Text('チーム管理')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: T.light,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(me?.orgName ?? '組織',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              color: T.primary)),
                      Text(
                          'プラン：${me?.orgPlan ?? "—"} ・ メンバー：${_members.length}名',
                          style: const TextStyle(
                              fontSize: 13, color: T.textMid)),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  '役割と権限\n'
                  '・管理者：全権限 + チーム/組織設定\n'
                  '・PM：案件作成/削除・段階進行・法定期限設定\n'
                  '・調査員：タスク/種記録/文書の編集（現場作業）\n'
                  '・閲覧者：閲覧のみ',
                  style: TextStyle(fontSize: 12, color: T.textMuted),
                ),
                const SizedBox(height: 14),
                ..._members.map((m) {
                  final isMe = m['id'] == me?.id;
                  final role = m['role'] as String? ?? 'viewer';
                  return Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: T.light,
                        child: Text(
                          (m['name'] as String? ?? '?')
                              .characters
                              .first,
                          style: const TextStyle(
                              color: T.primary,
                              fontWeight: FontWeight.w800),
                        ),
                      ),
                      title: Text(
                          '${m['name'] ?? ''}${isMe ? "（自分）" : ""}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14)),
                      subtitle: Text(roleFromString(role).label,
                          style: const TextStyle(fontSize: 12)),
                      trailing: isMe
                          ? null
                          : PopupMenuButton<String>(
                              icon: const Icon(Icons.edit_outlined,
                                  size: 20),
                              onSelected: (v) =>
                                  _changeRole(m['id'] as String, v),
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                    value: 'admin',
                                    child: Text('管理者')),
                                PopupMenuItem(
                                    value: 'pm',
                                    child: Text('プロジェクトマネージャー')),
                                PopupMenuItem(
                                    value: 'surveyor',
                                    child: Text('調査員')),
                                PopupMenuItem(
                                    value: 'viewer',
                                    child: Text('閲覧者')),
                              ],
                            ),
                    ),
                  );
                }),
                const SizedBox(height: 10),
                const Text(
                  '新メンバーの招待はSupabaseダッシュボード（Authentication → Invite user）から行い、'
                  '招待後にこの画面で役割を設定してください。',
                  style: TextStyle(fontSize: 12, color: T.textFaint),
                ),
              ],
            ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 認証サービス + Riverpodプロバイダ
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/constants.dart';
import '../models/models.dart';
import 'project_repository.dart';

final supabaseProvider =
    Provider<SupabaseClient>((ref) => Supabase.instance.client);

final repositoryProvider = Provider<ProjectRepository>((ref) {
  final repo = ProjectRepository(ref.watch(supabaseProvider));
  ref.onDispose(repo.dispose);
  return repo;
});

// ── 認証状態 ──────────────────────────────────────────────────────────────

class AuthState2 {
  final UserProfile? profile;
  final bool loading;
  final String? error;
  const AuthState2({this.profile, this.loading = false, this.error});

  bool get isLoggedIn => profile != null;
}

class AuthNotifier extends Notifier<AuthState2> {
  @override
  AuthState2 build() {
    // build() 完了後に実行する。currentSession は同期的に返るため、
    // ここで直接呼ぶと state 更新が build() の戻り値で上書きされ、
    // ローディング画面から抜けられなくなる。
    Future.microtask(_restoreSession);
    return const AuthState2(loading: true);
  }

  SupabaseClient get _sb => ref.read(supabaseProvider);
  ProjectRepository get _repo => ref.read(repositoryProvider);

  Future<void> _restoreSession() async {
    try {
      final session = _sb.auth.currentSession;
      if (session == null) {
        state = const AuthState2(loading: false);
        return;
      }
      await _loadProfile(session.user);
    } catch (e) {
      // 何があってもローディングで固まらせない（ログイン画面へフォールバック）
      state = AuthState2(loading: false, error: 'セッション復元エラー: $e');
    }
  }

  Future<void> _loadProfile(User user) async {
    try {
      final row = await _sb
          .from('profiles')
          .select('*, organizations(*)')
          .eq('id', user.id)
          .single();

      final org = row['organizations'] as Map<String, dynamic>?;
      final profile = UserProfile(
        id: user.id,
        name: row['name'] as String? ?? user.email ?? '',
        email: user.email ?? '',
        role: roleFromString(row['role'] as String?),
        orgId: row['organization_id'] as String?,
        orgName: org?['name'] as String?,
        orgPlan: org?['plan'] as String?,
      );

      // リポジトリにorg_idを伝え、サーバーデータ取得 + キューのフラッシュ
      _repo.orgId = profile.orgId;
      await _repo.loadFromServer();

      state = AuthState2(profile: profile, loading: false);
    } catch (e) {
      state = AuthState2(loading: false, error: 'プロフィール読込エラー: $e');
    }
  }

  Future<void> signIn(String email, String password) async {
    state = const AuthState2(loading: true);
    try {
      final res = await _sb.auth
          .signInWithPassword(email: email.trim(), password: password);
      if (res.user != null) {
        await _loadProfile(res.user!);
      } else {
        state = const AuthState2(loading: false, error: 'ログインに失敗しました');
      }
    } on AuthException catch (e) {
      state = AuthState2(
        loading: false,
        error: e.message.contains('Invalid')
            ? 'メールアドレスまたはパスワードが正しくありません'
            : e.message,
      );
    } catch (e) {
      state = AuthState2(loading: false, error: '接続エラー：$e');
    }
  }

  Future<void> signOut() async {
    await _sb.auth.signOut();
    state = const AuthState2(loading: false);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState2>(
  AuthNotifier.new,
);

// ── プロジェクト一覧 ──────────────────────────────────────────────────────

final projectsProvider = StreamProvider<List<Project>>((ref) async* {
  final repo = ref.watch(repositoryProvider);
  yield repo.currentProjects;
  yield* repo.projects$;
});

final syncStatusProvider = StreamProvider<SyncStatus>((ref) async* {
  final repo = ref.watch(repositoryProvider);
  yield* repo.status$;
});

// 現在開いているプロジェクトID
final selectedProjectIdProvider = StateProvider<String?>((ref) => null);

final selectedProjectProvider = Provider<Project?>((ref) {
  final id = ref.watch(selectedProjectIdProvider);
  if (id == null) return null;
  final projects = ref.watch(projectsProvider).valueOrNull ?? [];
  try {
    return projects.firstWhere((p) => p.id == id);
  } catch (_) {
    return null;
  }
});

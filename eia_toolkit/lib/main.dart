// ─────────────────────────────────────────────────────────────────────────────
// EIAツールキット — エントリーポイント
//
// セットアップ:
//   1. 下記 supabaseUrl / supabaseAnonKey を自分のプロジェクトの値に変更
//   2. flutter pub get
//   3. flutter run
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/theme.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'services/providers.dart';

// Supabaseプロジェクト設定
// publishableKey（sb_publishable_...）はクライアント埋め込み前提の公開鍵。
const supabaseUrl = 'https://mlqbnpcyurjuujmadnis.supabase.co';
const supabasePublishableKey = 'sb_publishable_bHwIXlRm-28rExbnQwmjlg_bZYdDTcm';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Hive.initFlutter();

  await Supabase.initialize(
    url: supabaseUrl,
    anonKey: supabasePublishableKey,
  );

  runApp(const ProviderScope(child: EiaApp()));
}

class EiaApp extends ConsumerWidget {
  const EiaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'EIAツールキット',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      locale: const Locale('ja'),
      supportedLocales: const [Locale('ja'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends ConsumerStatefulWidget {
  const _AuthGate();

  @override
  ConsumerState<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends ConsumerState<_AuthGate> {
  @override
  void initState() {
    super.initState();
    // リポジトリ初期化（Hive・接続監視・キュー）
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(repositoryProvider).init();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    if (auth.loading && auth.profile == null) {
      return const Scaffold(
        backgroundColor: T.primary,
        body: Center(
          child: CircularProgressIndicator(color: Colors.white),
        ),
      );
    }

    return auth.isLoggedIn ? const DashboardScreen() : const LoginScreen();
  }
}

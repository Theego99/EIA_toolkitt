// ─────────────────────────────────────────────────────────────────────────────
// デザイントークン — EIA Toolkit ブランド
// 深い森の緑 = 環境コンサルの信頼性。フィールドでの視認性を最優先。
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';

abstract class T {
  // Brand
  static const primary = Color(0xFF1B4332); // 深緑 — brand anchor
  static const mid = Color(0xFF2D6A4F);
  static const light = Color(0xFFD8EFE3);

  // Surfaces
  static const bg = Color(0xFFF4F1EA); // 和紙のような生成り
  static const surface = Color(0xFFFFFFFF);
  static const warm = Color(0xFFFAF8F3);

  // Borders
  static const border = Color(0xFFDDD8CE);
  static const borderLight = Color(0xFFEDE9E1);

  // Semantic
  static const amber = Color(0xFFC47B0A);
  static const amberLight = Color(0xFFFEF3C7);
  static const red = Color(0xFFB91C1C);
  static const redLight = Color(0xFFFEE2E2);
  static const blue = Color(0xFF2563EB);
  static const purple = Color(0xFF7C3AED);
  static const purpleLight = Color(0xFFEDE9FE);

  // Text
  static const text = Color(0xFF1A1F1C);
  static const textMid = Color(0xFF4A5550);
  static const textMuted = Color(0xFF8A948E);
  static const textFaint = Color(0xFFB5BDB8);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: T.primary,
      primary: T.primary,
      surface: T.surface,
      // ignore: deprecated_member_use
      background: T.bg,
    ),
    scaffoldBackgroundColor: T.bg,
    fontFamily: 'NotoSansJP',
  );

  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: T.primary,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: T.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: T.borderLight),
      ),
      margin: EdgeInsets.zero,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: T.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        // Field-friendly: large touch targets for gloved/outdoor use
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: T.primary,
        minimumSize: const Size(48, 48),
        side: const BorderSide(color: T.border),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: T.warm,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: T.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: T.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: T.primary, width: 2),
      ),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) =>
            states.contains(WidgetState.selected) ? T.mid : Colors.transparent,
      ),
      // Larger checkboxes for field use
      materialTapTargetSize: MaterialTapTargetSize.padded,
    ),
    dividerTheme: const DividerThemeData(color: T.borderLight, thickness: 1),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: T.text,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );
}

import 'package:flutter_dotenv/flutter_dotenv.dart';

class SupabaseConfig {
  // Read credentials from --dart-define flags (used in production builds).
  // Fall back to .env file when not provided (local development).
  static const _urlFromDefine = String.fromEnvironment('SUPABASE_URL');
  static const _anonKeyFromDefine = String.fromEnvironment('SUPABASE_ANON_KEY');

  static String get url {
    if (_urlFromDefine.isNotEmpty) return _urlFromDefine;
    final v = dotenv.env['SUPABASE_URL'];
    if (v != null && v.isNotEmpty) return v;
    throw StateError(
      'SUPABASE_URL is not set. '
      'Pass --dart-define=SUPABASE_URL=... at build time or set it in .env.',
    );
  }

  static String get anonKey {
    if (_anonKeyFromDefine.isNotEmpty) return _anonKeyFromDefine;
    final v = dotenv.env['SUPABASE_ANON_KEY'];
    if (v != null && v.isNotEmpty) return v;
    throw StateError(
      'SUPABASE_ANON_KEY is not set. '
      'Pass --dart-define=SUPABASE_ANON_KEY=... at build time or set it in .env.',
    );
  }
}

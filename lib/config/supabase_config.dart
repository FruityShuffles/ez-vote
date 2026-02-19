import 'package:flutter_dotenv/flutter_dotenv.dart';

class SupabaseConfig {
  // Read credentials from --dart-define flags (used in production builds).
  // Fall back to .env file when not provided (local development).
  static const _urlFromDefine = String.fromEnvironment('SUPABASE_URL');
  static const _anonKeyFromDefine = String.fromEnvironment('SUPABASE_ANON_KEY');

  static String get url =>
      _urlFromDefine.isNotEmpty ? _urlFromDefine : dotenv.env['SUPABASE_URL']!;

  static String get anonKey => _anonKeyFromDefine.isNotEmpty
      ? _anonKeyFromDefine
      : dotenv.env['SUPABASE_ANON_KEY']!;
}

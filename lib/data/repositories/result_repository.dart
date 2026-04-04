import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/result.dart';

class ResultRepository {
  final SupabaseClient _client;

  ResultRepository(this._client);

  Future<List<ElectionResult>> getResults(String electionId) async {
    const order = ['approval', 'irv', 'star', 'fptp'];
    final data = await _client
        .from('results')
        .select()
        .eq('election_id', electionId);
    final results = data.map((e) => ElectionResult.fromJson(e)).toList();
    results.sort((a, b) {
      final ai = order.indexOf(a.algorithm);
      final bi = order.indexOf(b.algorithm);
      return (ai < 0 ? 999 : ai).compareTo(bi < 0 ? 999 : bi);
    });
    return results;
  }

  Future<void> computeResults(String electionId, {bool close = true}) async {
    await _client.functions.invoke(
      'compute-results',
      body: {'election_id': electionId, 'close': close},
    );
  }

  Future<DateTime?> getResultsUpdatedAt(String electionId) async {
    final data = await _client
        .from('results')
        .select('updated_at')
        .eq('election_id', electionId)
        .order('updated_at', ascending: false)
        .limit(1);
    if (data.isEmpty) return null;
    return DateTime.parse(data.first['updated_at'] as String);
  }
}

import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/result.dart';

class ResultRepository {
  final SupabaseClient _client;

  ResultRepository(this._client);

  Future<List<ElectionResult>> getResults(String electionId) async {
    final data = await _client
        .from('results')
        .select()
        .eq('election_id', electionId)
        .order('algorithm');
    return data.map((e) => ElectionResult.fromJson(e)).toList();
  }

  Future<void> computeResults(String electionId, {bool close = true}) async {
    await _client.functions.invoke(
      'compute-results',
      body: {'election_id': electionId, 'close': close},
    );
  }
}

import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/candidate.dart';

class CandidateRepository {
  final SupabaseClient _client;

  CandidateRepository(this._client);

  Future<List<Candidate>> listForElection(String electionId) async {
    final data = await _client
        .from('candidates')
        .select()
        .eq('election_id', electionId)
        .order('position');
    return data.map((e) => Candidate.fromJson(e)).toList();
  }

  Future<void> setCandidates(
      String electionId, List<String> candidateNames) async {
    // Delete existing candidates
    await _client.from('candidates').delete().eq('election_id', electionId);

    // Insert new candidates
    final inserts = candidateNames.asMap().entries.map((entry) => {
          'election_id': electionId,
          'name': entry.value,
          'position': entry.key,
        }).toList();

    if (inserts.isNotEmpty) {
      await _client.from('candidates').insert(inserts);
    }
  }
}

import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/candidate.dart';
import '../../domain/exceptions.dart';

class CandidateRepository {
  final SupabaseClient _client;

  CandidateRepository(this._client);

  Future<List<Candidate>> listForElection(String electionId) async {
    final data = await _client
        .from('candidates')
        .select()
        .eq('election_id', electionId)
        .order('position');
    return data.map((e) => Candidate.fromJson(e)).toList()
      ..sort((a, b) => a.position.compareTo(b.position));
  }

  Future<int> countForElection(String electionId) async {
    final data = await _client
        .from('candidates')
        .select('id')
        .eq('election_id', electionId);
    return data.length;
  }

  Future<void> addCandidate(String electionId, String name) async {
    // Get the current max position
    final existing = await _client
        .from('candidates')
        .select('position')
        .eq('election_id', electionId)
        .order('position', ascending: false)
        .limit(1);
    final nextPosition =
        existing.isEmpty ? 0 : (existing[0]['position'] as int) + 1;
    try {
      await _client.from('candidates').insert({
        'election_id': electionId,
        'name': name,
        'position': nextPosition,
      });
    } on PostgrestException catch (e) {
      if (e.code == '23505') throw const DuplicateCandidateException();
      rethrow;
    }
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

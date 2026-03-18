import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/ballot.dart';

class BallotRepository {
  final SupabaseClient _client;

  BallotRepository(this._client);

  Future<Ballot?> getExistingBallot(String electionId) async {
    final userId = _client.auth.currentUser!.id;
    final data = await _client
        .from('ballots')
        .select()
        .eq('election_id', electionId)
        .eq('voter_id', userId)
        .maybeSingle();
    if (data == null) return null;
    return Ballot.fromJson(data);
  }

  Future<List<String>> getVoterNames(String electionId) async {
    final res = await _client.rpc(
      'get_election_voters',
      params: {'p_election_id': electionId},
    ) as List<dynamic>;
    return res.map((row) => (row['display_name'] as String?) ?? '').toList();
  }

  Future<int> getBallotCount(String electionId) async {
    final res = await _client.rpc(
      'get_ballot_count',
      params: {'p_election_id': electionId},
    );
    return (res as int?) ?? 0;
  }

  Future<Ballot> upsertBallot({
    required String electionId,
    required Map<String, dynamic> payload,
  }) async {
    final userId = _client.auth.currentUser!.id;
    final data = await _client
        .from('ballots')
        .upsert(
          {
            'election_id': electionId,
            'voter_id': userId,
            'payload': payload,
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          },
          onConflict: 'election_id,voter_id',
        )
        .select()
        .single();
    return Ballot.fromJson(data);
  }
}

import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/ballot.dart';

class Covoter {
  final String userId;
  final String displayName;
  final int electionCount;

  const Covoter({
    required this.userId,
    required this.displayName,
    required this.electionCount,
  });
}

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

  Future<List<Covoter>> getPriorCovoters(String electionId) async {
    final res = await _client.rpc(
      'get_prior_covoters',
      params: {'p_election_id': electionId},
    ) as List<dynamic>;
    return res
        .map((row) => Covoter(
              userId: row['user_id'] as String,
              displayName: (row['display_name'] as String?) ?? '',
              electionCount: (row['election_count'] as int?) ?? 1,
            ))
        .toList();
  }

  Future<List<String>> getPendingInvitees(String electionId) async {
    final res = await _client.rpc(
      'get_pending_invitees',
      params: {'p_election_id': electionId},
    ) as List<dynamic>;
    return res.map((row) => (row['display_name'] as String?) ?? '').toList();
  }

  Future<void> addVoterToElection(String electionId, String userId) async {
    await _client.rpc('add_voter_to_election', params: {
      'p_election_id': electionId,
      'p_voter_id': userId,
    });
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
          },
          onConflict: 'election_id,voter_id',
        )
        .select()
        .single();
    return Ballot.fromJson(data);
  }
}

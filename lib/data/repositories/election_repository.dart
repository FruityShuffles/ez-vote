import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/election.dart';

class ElectionRepository {
  final SupabaseClient _client;

  ElectionRepository(this._client);

  Future<Election> create({
    required String title,
    String? description,
    required List<String> algorithms,
    bool allowVoterCandidates = false,
    bool realtimeResults = false,
    bool includeFptp = true,
    bool publicBallots = false,
  }) async {
    final userId = _client.auth.currentUser!.id;
    final data = await _client
        .from('elections')
        .insert({
          'owner_id': userId,
          'title': title,
          'description': description,
          'status': 'draft',
          'algorithms': algorithms,
          'allow_voter_candidates': allowVoterCandidates,
          'realtime_results': realtimeResults,
          'include_fptp': includeFptp,
          'public_ballots': publicBallots,
        })
        .select()
        .single();
    return Election.fromJson(data);
  }

  Future<List<Election>> listOwned() async {
    final userId = _client.auth.currentUser!.id;
    final data = await _client
        .from('elections')
        .select()
        .eq('owner_id', userId)
        .order('created_at', ascending: false);
    return data.map((e) => Election.fromJson(e)).toList();
  }

  /// Returns open elections where the user is invited but has not yet voted.
  Future<List<Election>> listPendingInvitations() async {
    final res = await _client.rpc('get_pending_invitations') as List<dynamic>;
    return res
        .map((e) => Election.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Returns elections in which the current user has cast a ballot.
  Future<List<Election>> listVoted() async {
    final userId = _client.auth.currentUser!.id;
    final data = await _client
        .from('ballots')
        .select('elections(*)')
        .eq('voter_id', userId)
        .order('created_at', ascending: false);
    return data
        .map((e) => Election.fromJson(e['elections'] as Map<String, dynamic>))
        .toList();
  }

  Future<void> joinElection(String electionId) async {
    await _client.rpc('join_election', params: {'p_election_id': electionId});
  }

  Future<Election> getById(String id) async {
    final data =
        await _client.from('elections').select().eq('id', id).single();
    return Election.fromJson(data);
  }

  Future<Election> update(
    String id, {
    required String title,
    String? description,
    required List<String> algorithms,
    bool allowVoterCandidates = false,
    bool realtimeResults = false,
    bool includeFptp = true,
    bool publicBallots = false,
  }) async {
    final data = await _client
        .from('elections')
        .update({
          'title': title,
          'description': description,
          'algorithms': algorithms,
          'allow_voter_candidates': allowVoterCandidates,
          'realtime_results': realtimeResults,
          'include_fptp': includeFptp,
          'public_ballots': publicBallots,
        })
        .eq('id', id)
        .select()
        .single();
    return Election.fromJson(data);
  }

  Future<Election> updateStatus(String id, ElectionStatus status) async {
    final data = await _client
        .from('elections')
        .update({'status': status.name})
        .eq('id', id)
        .select()
        .single();
    return Election.fromJson(data);
  }

  Future<void> deleteElection(String id) async {
    await _client.from('elections').delete().eq('id', id);
  }
}

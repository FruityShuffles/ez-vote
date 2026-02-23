import 'package:supabase_flutter/supabase_flutter.dart';
import '../../domain/models/election.dart';

class ElectionRepository {
  final SupabaseClient _client;

  ElectionRepository(this._client);

  Future<Election> create({
    required String title,
    String? description,
    required List<String> algorithms,
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
  }) async {
    final data = await _client
        .from('elections')
        .update({
          'title': title,
          'description': description,
          'algorithms': algorithms,
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

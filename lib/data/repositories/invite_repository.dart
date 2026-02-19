import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../../domain/models/invite.dart';

class InviteRepository {
  final SupabaseClient _client;
  final _uuid = const Uuid();

  InviteRepository(this._client);

  Future<Invite> createInvite(String electionId, String email) async {
    final token = _uuid.v4();
    final data = await _client
        .from('invites')
        .insert({
          'election_id': electionId,
          'email': email,
          'token': token,
        })
        .select()
        .single();
    return Invite.fromJson(data);
  }

  Future<List<Invite>> listForElection(String electionId) async {
    final data = await _client
        .from('invites')
        .select()
        .eq('election_id', electionId)
        .order('created_at');
    return data.map((e) => Invite.fromJson(e)).toList();
  }

  Future<void> acceptInvite(String token) async {
    await _client.rpc('accept_invite', params: {'invite_token': token});
  }
}

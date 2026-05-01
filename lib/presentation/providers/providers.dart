import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../data/repositories/auth_repository.dart';
import '../../data/repositories/election_repository.dart';
import '../../data/repositories/candidate_repository.dart';
import '../../data/repositories/invite_repository.dart';
import '../../data/repositories/ballot_repository.dart';
export '../../data/repositories/ballot_repository.dart'
    show Covoter, PublicBallot;
import '../../data/repositories/result_repository.dart';
import '../../domain/models/election.dart';
import '../../domain/models/candidate.dart';
import '../../domain/models/invite.dart';
import '../../domain/models/result.dart';
import '../../domain/models/ballot.dart';

// --- Core ---

final supabaseClientProvider = Provider<SupabaseClient>((ref) {
  return Supabase.instance.client;
});

// --- Repositories ---

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(supabaseClientProvider));
});

final electionRepositoryProvider = Provider<ElectionRepository>((ref) {
  return ElectionRepository(ref.watch(supabaseClientProvider));
});

final candidateRepositoryProvider = Provider<CandidateRepository>((ref) {
  return CandidateRepository(ref.watch(supabaseClientProvider));
});

final inviteRepositoryProvider = Provider<InviteRepository>((ref) {
  return InviteRepository(ref.watch(supabaseClientProvider));
});

final ballotRepositoryProvider = Provider<BallotRepository>((ref) {
  return BallotRepository(ref.watch(supabaseClientProvider));
});

final resultRepositoryProvider = Provider<ResultRepository>((ref) {
  return ResultRepository(ref.watch(supabaseClientProvider));
});

// --- Auth State ---

final authStateProvider = StreamProvider<AuthState>((ref) {
  return ref.watch(authRepositoryProvider).authStateChanges;
});

final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(authStateProvider).whenOrNull(
        data: (state) => state.session?.user,
      );
});

// --- Data Providers ---

final ownedElectionsProvider = FutureProvider<List<Election>>((ref) async {
  ref.watch(authStateProvider);
  return ref.read(electionRepositoryProvider).listOwned();
});

final votedElectionsProvider = FutureProvider<List<Election>>((ref) async {
  ref.watch(authStateProvider);
  return ref.read(electionRepositoryProvider).listVoted();
});

final electionProvider =
    FutureProvider.family<Election, String>((ref, id) async {
  return ref.read(electionRepositoryProvider).getById(id);
});

final candidatesProvider =
    FutureProvider.family<List<Candidate>, String>((ref, electionId) async {
  return ref.read(candidateRepositoryProvider).listForElection(electionId);
});

final invitesProvider =
    FutureProvider.family<List<Invite>, String>((ref, electionId) async {
  return ref.read(inviteRepositoryProvider).listForElection(electionId);
});

final existingBallotProvider =
    FutureProvider.family<Ballot?, String>((ref, electionId) async {
  return ref.read(ballotRepositoryProvider).getExistingBallot(electionId);
});

final resultsProvider =
    FutureProvider.family<List<ElectionResult>, String>((ref, electionId) async {
  return ref.read(resultRepositoryProvider).getResults(electionId);
});

final ballotCountProvider =
    FutureProvider.family<int, String>((ref, electionId) async {
  return ref.read(ballotRepositoryProvider).getBallotCount(electionId);
});

final electionVotersProvider =
    FutureProvider.family<List<String>, String>((ref, electionId) async {
  return ref.read(ballotRepositoryProvider).getVoterNames(electionId);
});

final publicBallotsProvider =
    FutureProvider.family<List<PublicBallot>, String>((ref, electionId) async {
  return ref.read(ballotRepositoryProvider).getPublicBallots(electionId);
});

final pendingInviteesProvider =
    FutureProvider.family<List<String>, String>((ref, electionId) async {
  return ref.read(ballotRepositoryProvider).getPendingInvitees(electionId);
});

final priorCovotersProvider =
    FutureProvider.family<List<Covoter>, String>((ref, electionId) async {
  return ref.read(ballotRepositoryProvider).getPriorCovoters(electionId);
});

final pendingInvitationsProvider =
    FutureProvider<List<Election>>((ref) async {
  ref.watch(authStateProvider);
  return ref.read(electionRepositoryProvider).listPendingInvitations();
});

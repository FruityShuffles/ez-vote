import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../../domain/models/election.dart';
import '../widgets/results_view.dart';
import '../widgets/dashboard_button.dart';

class ElectionDetailScreen extends ConsumerStatefulWidget {
  final String electionId;

  const ElectionDetailScreen({super.key, required this.electionId});

  @override
  ConsumerState<ElectionDetailScreen> createState() =>
      _ElectionDetailScreenState();
}

class _ElectionDetailScreenState extends ConsumerState<ElectionDetailScreen> {
  Timer? _pollTimer;
  DateTime? _lastResultsUpdatedAt;

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) => _poll());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _poll() async {
    final election = ref.read(electionProvider(widget.electionId)).valueOrNull;
    if (election == null || election.status != ElectionStatus.open) return;

    // Poll for candidate changes (ad-hoc elections)
    if (election.allowVoterCandidates) {
      final freshCount = await ref
          .read(candidateRepositoryProvider)
          .countForElection(widget.electionId);
      final cachedCandidates =
          ref.read(candidatesProvider(widget.electionId)).valueOrNull;
      if (cachedCandidates != null && freshCount != cachedCandidates.length) {
        ref.invalidate(candidatesProvider(widget.electionId));
        // Also refresh the election so candidatesUpdatedAt is current,
        // which triggers the stale-ballot warning for voters who already voted.
        ref.invalidate(electionProvider(widget.electionId));
      }
    }

    // Poll for results changes (realtime results)
    if (election.realtimeResults) {
      final freshUpdatedAt = await ref
          .read(resultRepositoryProvider)
          .getResultsUpdatedAt(widget.electionId);
      if (freshUpdatedAt != null &&
          _lastResultsUpdatedAt != null &&
          freshUpdatedAt != _lastResultsUpdatedAt) {
        ref.invalidate(resultsProvider(widget.electionId));
        ref.invalidate(ballotCountProvider(widget.electionId));
      }
      _lastResultsUpdatedAt = freshUpdatedAt;
    }
  }

  @override
  Widget build(BuildContext context) {
    final electionId = widget.electionId;
    final electionAsync = ref.watch(electionProvider(electionId));
    final candidatesAsync = ref.watch(candidatesProvider(electionId));

    final existingBallotAsync = ref.watch(existingBallotProvider(electionId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Election Details'),
        leading: const DashboardButton(),
      ),
      body: electionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (election) {
          final currentUserId =
              ref.read(supabaseClientProvider).auth.currentUser?.id;
          final isOwner = election.ownerId == currentUserId;
          final hasSubmittedBallot =
              existingBallotAsync.valueOrNull != null;

          final showResults = election.status == ElectionStatus.closed ||
              (election.realtimeResults &&
                  election.status == ElectionStatus.open &&
                  hasSubmittedBallot);

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 600),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(election.title,
                        style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 8),
                    if (election.description != null)
                      Text(election.description!),
                    const SizedBox(height: 16),
                    _StatusChip(status: election.status),
                    const SizedBox(height: 8),
                    _BallotCountRow(electionId: electionId),
                    const SizedBox(height: 16),
                    Text('Algorithms: ${election.algorithms.join(", ")}'),
                    if (showResults) ...[
                      const Divider(height: 32),
                      Text(
                          election.status == ElectionStatus.open
                              ? 'Live Results'
                              : 'Results',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 16),
                      ResultsView(electionId: electionId),
                    ],
                    const SizedBox(height: 24),
                    Text('Candidates',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    candidatesAsync.when(
                      loading: () => const CircularProgressIndicator(),
                      error: (e, _) => Text('Error: $e'),
                      data: (candidates) => Column(
                        children: [
                          ...candidates
                              .map((c) => ListTile(
                                    title: Text(c.name),
                                  )),
                          if (election.allowVoterCandidates &&
                              election.status == ElectionStatus.open)
                            _AddCandidateField(electionId: electionId),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (isOwner) ...[
                      _OwnerControls(
                        election: election,
                        electionId: electionId,
                      ),
                    ],
                    if (election.status == ElectionStatus.open ||
                        election.status == ElectionStatus.closed) ...[
                      _VoterControls(electionId: electionId),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _BallotCountRow extends ConsumerWidget {
  final String electionId;

  const _BallotCountRow({required this.electionId});

  void _showVoters(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      builder: (_) => _VoterListSheet(electionId: electionId),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countAsync = ref.watch(ballotCountProvider(electionId));
    return countAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (e, s) => const SizedBox.shrink(),
      data: (n) => InkWell(
        onTap: () => _showVoters(context, ref),
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.how_to_vote_outlined,
                  size: 16, color: Colors.grey),
              const SizedBox(width: 6),
              Text(
                '$n ballot${n == 1 ? '' : 's'} submitted',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VoterListSheet extends ConsumerWidget {
  final String electionId;

  const _VoterListSheet({required this.electionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final votersAsync = ref.watch(electionVotersProvider(electionId));
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Voters', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          votersAsync.when(
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, s) =>
                Text('Could not load voters: $e'),
            data: (names) => names.isEmpty
                ? const Text('No ballots submitted yet.')
                : ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: names.length,
                    separatorBuilder: (_, index) => const Divider(height: 1),
                    itemBuilder: (_, i) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Text(names[i]),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final ElectionStatus status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      ElectionStatus.draft => (Colors.grey, 'DRAFT'),
      ElectionStatus.open => (Colors.green, 'OPEN'),
      ElectionStatus.closed => (Colors.red, 'CLOSED'),
    };

    return Align(
      alignment: Alignment.centerLeft,
      child: Chip(
        label: Text(label),
        backgroundColor: color.withValues(alpha: 0.15),
        labelStyle: TextStyle(color: color, fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _OwnerControls extends ConsumerWidget {
  final Election election;
  final String electionId;

  const _OwnerControls({required this.election, required this.electionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(),
        Text('Owner Controls',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            if (election.status == ElectionStatus.draft)
              OutlinedButton.icon(
                onPressed: () =>
                    context.push('/election/$electionId/edit'),
                icon: const Icon(Icons.edit),
                label: const Text('Edit Election'),
              ),
            if (election.status == ElectionStatus.draft)
              FilledButton.icon(
                onPressed: () async {
                  await ref
                      .read(electionRepositoryProvider)
                      .updateStatus(electionId, ElectionStatus.open);
                  ref.invalidate(electionProvider(electionId));
                  ref.invalidate(ownedElectionsProvider);
                },
                icon: const Icon(Icons.play_arrow),
                label: const Text('Open Election'),
              ),
            if (election.status == ElectionStatus.open) ...[
              FilledButton.icon(
                onPressed: () async {
                  try {
                    await ref
                        .read(resultRepositoryProvider)
                        .computeResults(electionId, close: true);
                    ref.invalidate(electionProvider(electionId));
                    ref.invalidate(ownedElectionsProvider);
                    ref.invalidate(resultsProvider(electionId));
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Error computing results: $e')),
                      );
                    }
                  }
                },
                icon: const Icon(Icons.stop),
                label: Text(election.realtimeResults
                    ? 'Close Election'
                    : 'Close & Compute Results'),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.red,
                ),
              ),
              if (election.inviteMode == 'open')
                OutlinedButton.icon(
                  onPressed: () {
                    final joinUrl =
                        '${Uri.base.origin}/election/$electionId/join';
                    Clipboard.setData(ClipboardData(text: joinUrl));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Join link copied!')),
                    );
                  },
                  icon: const Icon(Icons.link),
                  label: const Text('Copy Join Link'),
                ),
              if (election.inviteMode == 'invite_only')
                OutlinedButton.icon(
                  onPressed: () =>
                      context.push('/election/$electionId/invite'),
                  icon: const Icon(Icons.person_add),
                  label: const Text('Invite Voters'),
                ),
            ],
          ],
        ),
      ],
    );
  }
}

class _VoterControls extends ConsumerStatefulWidget {
  final String electionId;

  const _VoterControls({required this.electionId});

  @override
  ConsumerState<_VoterControls> createState() => _VoterControlsState();
}

class _VoterControlsState extends ConsumerState<_VoterControls> {
  /// Silently refreshes candidates if the count changed. Never blocks navigation.
  Future<void> _refreshIfChanged() async {
    final election =
        ref.read(electionProvider(widget.electionId)).valueOrNull;
    if (election == null || !election.allowVoterCandidates) return;

    final freshCount = await ref
        .read(candidateRepositoryProvider)
        .countForElection(widget.electionId);
    final cached =
        ref.read(candidatesProvider(widget.electionId)).valueOrNull;
    if (cached != null && freshCount != cached.length) {
      ref.invalidate(candidatesProvider(widget.electionId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final electionId = widget.electionId;
    final existingBallot = ref.watch(existingBallotProvider(electionId));
    final electionAsync = ref.watch(electionProvider(electionId));
    final isClosed = electionAsync.valueOrNull?.status == ElectionStatus.closed;

    return existingBallot.when(
      loading: () => const SizedBox(),
      error: (_, _) => const SizedBox(),
      data: (ballot) {
        if (ballot != null) {
          final election = electionAsync.valueOrNull;
          final isStale = election != null &&
              election.candidatesUpdatedAt.isAfter(ballot.updatedAt);
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (isStale && !isClosed)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: Colors.orange.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: Colors.orange.withValues(alpha: 0.4)),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.warning_amber, color: Colors.orange),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Candidates have changed since your last vote — update your ballot.',
                              style: TextStyle(color: Colors.orange),
                            ),
                          ),
                        ],
                      ),
                    ),
                  const Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.green),
                      SizedBox(width: 8),
                      Text('You have already submitted your ballot.'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () async {
                      await _refreshIfChanged();
                      if (!context.mounted) return;
                      context.push(
                        '/election/$electionId/vote',
                        extra: {'ballot': ballot, 'viewOnly': isClosed},
                      );
                    },
                    icon: Icon(isClosed ? Icons.visibility : Icons.edit),
                    label: Text(isClosed ? 'View Ballot' : 'Edit Ballot'),
                  ),
                ],
              ),
            ),
          );
        }
        if (isClosed) return const SizedBox();
        return FilledButton.icon(
          onPressed: () async {
            await _refreshIfChanged();
            if (!context.mounted) return;
            context.push('/election/$electionId/vote');
          },
          icon: const Icon(Icons.how_to_vote),
          label: const Text('Cast Your Vote'),
        );
      },
    );
  }
}

class _AddCandidateField extends ConsumerStatefulWidget {
  final String electionId;

  const _AddCandidateField({required this.electionId});

  @override
  ConsumerState<_AddCandidateField> createState() =>
      _AddCandidateFieldState();
}

class _AddCandidateFieldState extends ConsumerState<_AddCandidateField> {
  final _controller = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final name = _controller.text.trim();
    if (name.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref
          .read(candidateRepositoryProvider)
          .addCandidate(widget.electionId, name);
      _controller.clear();
      ref.invalidate(candidatesProvider(widget.electionId));
      ref.invalidate(electionProvider(widget.electionId));
    } catch (e) {
      if (mounted) {
        final msg = e.toString().contains('idx_candidates_unique_name')
            ? 'A candidate with that name already exists'
            : 'Error adding candidate: $e';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              decoration: const InputDecoration(
                hintText: 'Add a candidate...',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onSubmitted: (_) => _add(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: _submitting ? null : _add,
            icon: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.add),
          ),
        ],
      ),
    );
  }
}

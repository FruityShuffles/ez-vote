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
                constraints: const BoxConstraints(maxWidth: 960),
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
                    _PendingInviteesRow(electionId: electionId),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: election.algorithms.map((algo) {
                        final (icon, label) = switch (algo) {
                          'approval' => (Icons.thumb_up_outlined, 'Approval'),
                          'irv' => (Icons.format_list_numbered, 'IRV'),
                          'star' => (Icons.star_outline, 'STAR'),
                          'fptp' => (Icons.person_outlined, 'FPTP'),
                          _ => (Icons.how_to_vote_outlined, algo),
                        };
                        return Chip(
                          avatar: Icon(icon, size: 18),
                          label: Text(label),
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                        );
                      }).toList(),
                    ),
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
                    if (election.status != ElectionStatus.closed) ...[
                      const SizedBox(height: 24),
                      candidatesAsync.when(
                        loading: () => const CircularProgressIndicator(),
                        error: (e, _) => Text('Error: $e'),
                        data: (candidates) => Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Candidates (${candidates.length})',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 4,
                              children: candidates
                                  .map((c) => Chip(
                                        label: Text(c.name),
                                        backgroundColor: Colors.indigo
                                            .withValues(alpha: 0.15),
                                      ))
                                  .toList(),
                            ),
                            if (election.allowVoterCandidates &&
                                election.status == ElectionStatus.open)
                              _AddCandidateField(electionId: electionId),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    if (isOwner) ...[
                      _OwnerControls(
                        election: election,
                        electionId: electionId,
                      ),
                    ],
                    if (election.status == ElectionStatus.open ||
                        election.status == ElectionStatus.closed) ...[
                      if (isOwner) const SizedBox(height: 12),
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.settings, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Text('Owner Controls',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey,
                        )),
              ],
            ),
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
                  OutlinedButton.icon(
                    onPressed: () => showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => _InviteSheet(electionId: electionId),
                    ),
                    icon: const Icon(Icons.person_add),
                    label: const Text('Invite'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
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
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: FilledButton.icon(
              onPressed: () async {
                await _refreshIfChanged();
                if (!context.mounted) return;
                context.push('/election/$electionId/vote');
              },
              icon: const Icon(Icons.how_to_vote),
              label: const Text('Cast Your Vote'),
            ),
          ),
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

class _InviteSheet extends ConsumerStatefulWidget {
  final String electionId;

  const _InviteSheet({required this.electionId});

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _searchController = TextEditingController();
  final Set<String> _addedIds = {};
  final Set<String> _loadingIds = {};
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _copyJoinLink(BuildContext context) {
    final joinUrl =
        '${Uri.base.origin}/election/${widget.electionId}/join';
    Clipboard.setData(ClipboardData(text: joinUrl));
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Join link copied!')));
  }

  Future<void> _addVoter(String userId) async {
    setState(() => _loadingIds.add(userId));
    try {
      await ref
          .read(ballotRepositoryProvider)
          .addVoterToElection(widget.electionId, userId);
      setState(() => _addedIds.add(userId));
      ref.invalidate(priorCovotersProvider(widget.electionId));
      ref.invalidate(pendingInviteesProvider(widget.electionId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error adding voter: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingIds.remove(userId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final covotersAsync = ref.watch(priorCovotersProvider(widget.electionId));
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 20, 16, 32 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Invite Voters',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => _copyJoinLink(context),
            icon: const Icon(Icons.link),
            label: const Text('Copy Join Link'),
          ),
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 8),
          Text('Add from prior elections',
              style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          TextField(
            controller: _searchController,
            decoration: const InputDecoration(
              hintText: 'Search by name...',
              prefixIcon: Icon(Icons.search),
              border: OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
          const SizedBox(height: 8),
          covotersAsync.when(
            loading: () =>
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                ),
            error: (e, s) => Text('Could not load: $e'),
            data: (covoters) {
              final filtered = _query.isEmpty
                  ? covoters
                  : covoters
                      .where((c) => c.displayName
                          .toLowerCase()
                          .contains(_query))
                      .toList();

              if (filtered.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Text(
                    _query.isEmpty
                        ? 'No prior co-voters to add.'
                        : 'No matches for "$_query".',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                );
              }

              return ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 300),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: filtered.length,
                  separatorBuilder: (_, index) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final c = filtered[i];
                    final added = _addedIds.contains(c.userId);
                    final loading = _loadingIds.contains(c.userId);
                    return ListTile(
                      dense: true,
                      title: Text(c.displayName),
                      subtitle: Text(
                        'Voted with you in ${c.electionCount} '
                        'election${c.electionCount == 1 ? '' : 's'}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      trailing: loading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : added
                              ? const Icon(Icons.check,
                                  color: Colors.green)
                              : TextButton(
                                  onPressed: () => _addVoter(c.userId),
                                  child: const Text('Add'),
                                ),
                    );
                  },
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _PendingInviteesRow extends ConsumerWidget {
  final String electionId;

  const _PendingInviteesRow({required this.electionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pendingAsync = ref.watch(pendingInviteesProvider(electionId));
    return pendingAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (names) {
        if (names.isEmpty) return const SizedBox.shrink();
        final n = names.length;
        return InkWell(
          onTap: () => showModalBottomSheet(
            context: context,
            builder: (_) => _PendingInviteesSheet(names: names),
          ),
          borderRadius: BorderRadius.circular(4),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.person_outline, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Text(
                  '$n pending invitee${n == 1 ? '' : 's'}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _PendingInviteesSheet extends StatelessWidget {
  final List<String> names;

  const _PendingInviteesSheet({required this.names});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Pending Invitees',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: names.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(names[i]),
            ),
          ),
        ],
      ),
    );
  }
}

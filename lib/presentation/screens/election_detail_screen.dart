import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../../domain/models/election.dart';
import '../widgets/results_view.dart';

class ElectionDetailScreen extends ConsumerWidget {
  final String electionId;

  const ElectionDetailScreen({super.key, required this.electionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final electionAsync = ref.watch(electionProvider(electionId));
    final candidatesAsync = ref.watch(candidatesProvider(electionId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Election Details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.home),
            tooltip: 'Home',
            onPressed: () => context.go('/'),
          ),
        ],
      ),
      body: electionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (election) {
          final currentUserId =
              ref.read(supabaseClientProvider).auth.currentUser?.id;
          final isOwner = election.ownerId == currentUserId;

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
                    const SizedBox(height: 16),
                    Text('Algorithms: ${election.algorithms.join(", ")}'),
                    const SizedBox(height: 24),
                    Text('Candidates',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    candidatesAsync.when(
                      loading: () => const CircularProgressIndicator(),
                      error: (e, _) => Text('Error: $e'),
                      data: (candidates) => Column(
                        children: candidates
                            .map((c) => ListTile(
                                  leading: CircleAvatar(
                                      child: Text('${c.position + 1}')),
                                  title: Text(c.name),
                                ))
                            .toList(),
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
                    if (election.status == ElectionStatus.closed) ...[
                      const Divider(height: 32),
                      Text('Results',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 16),
                      ResultsView(electionId: electionId),
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
                        .computeResults(electionId);
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
                label: const Text('Close & Compute Results'),
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

class _VoterControls extends ConsumerWidget {
  final String electionId;

  const _VoterControls({required this.electionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final existingBallot = ref.watch(existingBallotProvider(electionId));
    final electionAsync = ref.watch(electionProvider(electionId));
    final isClosed = electionAsync.valueOrNull?.status == ElectionStatus.closed;

    return existingBallot.when(
      loading: () => const SizedBox(),
      error: (_, _) => const SizedBox(),
      data: (ballot) {
        if (ballot != null) {
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.green),
                      SizedBox(width: 8),
                      Text('You have already submitted your ballot.'),
                    ],
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => context.push(
                      '/election/$electionId/vote',
                      extra: {'ballot': ballot, 'viewOnly': isClosed},
                    ),
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
          onPressed: () => context.push('/election/$electionId/vote'),
          icon: const Icon(Icons.how_to_vote),
          label: const Text('Cast Your Vote'),
        );
      },
    );
  }
}

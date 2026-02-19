import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../../domain/models/result.dart';

class ResultsView extends ConsumerWidget {
  final String electionId;

  const ResultsView({super.key, required this.electionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resultsAsync = ref.watch(resultsProvider(electionId));

    return resultsAsync.when(
      loading: () => const CircularProgressIndicator(),
      error: (e, _) => Text('Error loading results: $e'),
      data: (results) {
        if (results.isEmpty) {
          return const Text('No results computed yet.');
        }
        return Column(
          children: results
              .map((r) => _ResultCard(result: r))
              .toList(),
        );
      },
    );
  }
}

class _ResultCard extends StatelessWidget {
  final ElectionResult result;

  const _ResultCard({required this.result});

  @override
  Widget build(BuildContext context) {
    final data = result.resultData;
    final algorithmLabel = switch (result.algorithm) {
      'approval' => 'Approval Voting',
      'irv' => 'Instant Runoff Voting (IRV)',
      'star' => 'STAR Voting',
      _ => result.algorithm,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(algorithmLabel,
                style: Theme.of(context).textTheme.titleMedium),
            const Divider(),
            if (data['winner'] != null) ...[
              Row(
                children: [
                  const Icon(Icons.emoji_events, color: Colors.amber),
                  const SizedBox(width: 8),
                  Text('Winner: ${data['winner']}',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16)),
                ],
              ),
              const SizedBox(height: 8),
            ],
            if (data['runner_up'] != null)
              Text('Runner-up: ${data['runner_up']}'),
            const SizedBox(height: 12),
            if (result.algorithm == 'approval') _buildApprovalDetails(data),
            if (result.algorithm == 'irv') _buildIrvDetails(data),
            if (result.algorithm == 'star') _buildStarDetails(data),
          ],
        ),
      ),
    );
  }

  Widget _buildApprovalDetails(Map<String, dynamic> data) {
    final tallies = data['tallies'] as Map<String, dynamic>? ?? {};
    final maxCount =
        tallies.values.fold<num>(1, (a, b) => b > a ? b : a).toDouble();

    final sorted = tallies.entries.toList()
      ..sort((a, b) => (b.value as num).compareTo(a.value as num));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Approval Counts:',
            style: TextStyle(fontWeight: FontWeight.w500)),
        const SizedBox(height: 8),
        ...sorted.map((entry) {
          final fraction = (entry.value as num) / maxCount;
          return Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${entry.key}: ${entry.value}'),
                LinearProgressIndicator(value: fraction.toDouble()),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildIrvDetails(Map<String, dynamic> data) {
    final rounds = data['rounds'] as List<dynamic>? ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Round-by-round elimination:',
            style: TextStyle(fontWeight: FontWeight.w500)),
        const SizedBox(height: 8),
        ...rounds.asMap().entries.map((entry) {
          final round = entry.value as Map<String, dynamic>;
          final eliminated = round['eliminated'];
          final counts = round['counts'] as Map<String, dynamic>? ?? {};

          return Card(
            color: Colors.grey.shade50,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Round ${entry.key + 1}',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  ...counts.entries.map((c) =>
                      Text('  ${c.key}: ${c.value}')),
                  if (eliminated != null)
                    Text('  Eliminated: $eliminated',
                        style: const TextStyle(
                            color: Colors.red,
                            fontStyle: FontStyle.italic)),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildStarDetails(Map<String, dynamic> data) {
    final scores = data['scores'] as Map<String, dynamic>? ?? {};
    final runoff = data['runoff'] as Map<String, dynamic>?;

    final sorted = scores.entries.toList()
      ..sort((a, b) => (b.value as num).compareTo(a.value as num));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Score Totals:',
            style: TextStyle(fontWeight: FontWeight.w500)),
        const SizedBox(height: 4),
        ...sorted.map((e) => Text('  ${e.key}: ${e.value}')),
        if (runoff != null) ...[
          const SizedBox(height: 12),
          const Text('Runoff:',
              style: TextStyle(fontWeight: FontWeight.w500)),
          ...runoff.entries.map((e) => Text('  ${e.key}: ${e.value} preferences')),
        ],
      ],
    );
  }
}

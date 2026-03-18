import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../../domain/models/result.dart';
import '../../domain/services/election_analysis_service.dart';

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
        return LayoutBuilder(
          builder: (context, constraints) {
            final sideBySide =
                results.length > 1 && constraints.maxWidth >= 480;
            return Column(
              children: [
                if (results.length > 1) _OverallWinnerCard(results: results),
                _AnalysisCard(results: results),
                if (sideBySide)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: results
                        .map((r) => Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: _ResultCard(result: r),
                              ),
                            ))
                        .toList(),
                  )
                else
                  ...results.map((r) => _ResultCard(result: r)),
              ],
            );
          },
        );
      },
    );
  }
}

class _OverallWinnerCard extends StatelessWidget {
  final List<ElectionResult> results;

  const _OverallWinnerCard({required this.results});

  @override
  Widget build(BuildContext context) {
    // Tally how many algorithms each candidate won (skip FPTP — it's a reference comparison).
    final wins = <String, int>{};
    final scoredResults = results.where((r) => r.algorithm != 'fptp').toList();
    for (final r in scoredResults) {
      final data = r.resultData;
      final winners = (data['winners'] as List<dynamic>?)?.cast<String>() ??
          (data['winner'] != null ? [data['winner'] as String] : []);
      for (final name in winners) {
        wins[name] = (wins[name] ?? 0) + 1;
      }
    }

    if (wins.isEmpty) return const SizedBox.shrink();

    final maxWins = wins.values.reduce((a, b) => a > b ? a : b);
    final leaders = wins.entries
        .where((e) => e.value == maxWins)
        .map((e) => e.key)
        .toList();

    // No meaningful overall result if everyone is tied or leader won only once.
    if (maxWins < 2 && scoredResults.length > 2) return const SizedBox.shrink();
    if (leaders.length > 1) return const SizedBox.shrink();

    final overallWinner = leaders.first;
    final isMajority = maxWins > scoredResults.length / 2;
    final label = isMajority ? 'Overall Majority Winner' : 'Overall Plurality Winner';
    final subtitle = '$overallWinner won $maxWins of ${scoredResults.length} algorithms';

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      color: Colors.amber.shade50,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.amber.shade300),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.workspace_premium, color: Colors.amber, size: 32),
            const SizedBox(width: 12),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: Colors.amber.shade800)),
                  Text(overallWinner,
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 18)),
                  Text(subtitle,
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AnalysisCard extends StatelessWidget {
  final List<ElectionResult> results;

  const _AnalysisCard({required this.results});

  @override
  Widget build(BuildContext context) {
    final analysis = analyzeResults(results);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      color: Colors.blueGrey.shade50,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.blueGrey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.analytics_outlined,
                    color: Colors.blueGrey.shade700, size: 28),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(
                    analysis.headline,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: Colors.blueGrey.shade800,
                        fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(analysis.summary,
                style: TextStyle(color: Colors.grey.shade700, fontSize: 14)),
            if (analysis.insights.isNotEmpty) ...[
              const SizedBox(height: 8),
              Theme(
                data: Theme.of(context)
                    .copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: Text('View detailed analysis',
                      style: TextStyle(
                          color: Colors.blueGrey.shade700,
                          fontSize: 14,
                          fontWeight: FontWeight.w500)),
                  children: analysis.insights
                      .map((insight) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(insight.icon,
                                    size: 20,
                                    color: Colors.blueGrey.shade600),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(insight.title,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 14)),
                                      const SizedBox(height: 4),
                                      Text(insight.body,
                                          style: TextStyle(
                                              color: Colors.grey.shade700,
                                              fontSize: 13)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ))
                      .toList(),
                ),
              ),
            ],
          ],
        ),
      ),
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
      'fptp' => 'First Past The Post (FPTP)',
      _ => result.algorithm,
    };

    final winners = (data['winners'] as List<dynamic>?)?.cast<String>();
    final isTie = winners != null && winners.length > 1;
    final displayWinner = isTie
        ? winners.join(' & ')
        : (winners?.firstOrNull ?? data['winner'] as String?);
    final runnerUp = data['runner_up'] as String?;
    final runnerUpSuppressed =
        winners != null && runnerUp != null && winners.contains(runnerUp);

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
            if (displayWinner != null) ...[
              Row(
                children: [
                  Icon(isTie ? Icons.balance : Icons.emoji_events,
                      color: Colors.amber),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      isTie ? 'Tied: $displayWinner' : 'Winner: $displayWinner',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            if (runnerUp != null && !runnerUpSuppressed)
              Text('Runner-up: $runnerUp'),
            const SizedBox(height: 12),
            if (result.algorithm == 'approval') _buildApprovalDetails(data),
            if (result.algorithm == 'irv') _buildIrvDetails(data),
            if (result.algorithm == 'star') _buildStarDetails(data),
            if (result.algorithm == 'fptp') _buildFptpDetails(data),
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
          final eliminatedStr = eliminated is List
              ? eliminated.join(', ')
              : eliminated?.toString();

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
                  if (eliminatedStr != null)
                    Text('  Eliminated: $eliminatedStr',
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

  Widget _buildFptpDetails(Map<String, dynamic> data) {
    final tallies = data['tallies'] as Map<String, dynamic>? ?? {};
    final maxCount =
        tallies.values.fold<num>(1, (a, b) => b > a ? b : a).toDouble();

    final sorted = tallies.entries.toList()
      ..sort((a, b) => (b.value as num).compareTo(a.value as num));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Vote Counts:',
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

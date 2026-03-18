import 'package:flutter/material.dart';
import '../models/election_analysis.dart';
import '../models/result.dart';

ElectionAnalysis analyzeResults(List<ElectionResult> results) {
  if (results.isEmpty) {
    return const ElectionAnalysis(
      headline: 'No results',
      summary: 'No results have been computed yet.',
      insights: [],
    );
  }

  // Step A: Extract winners per algorithm.
  final winnersMap = <String, List<String>>{};
  for (final r in results) {
    final data = r.resultData;
    final winners = (data['winners'] as List<dynamic>?)?.cast<String>() ??
        (data['winner'] != null ? [data['winner'] as String] : <String>[]);
    if (winners.isNotEmpty) {
      winnersMap[r.algorithm] = winners;
    }
  }

  // Single algorithm case.
  if (results.length == 1) {
    final algo = results.first.algorithm;
    final eduMessage = _educationalMessage(algo);
    final algoLabel = _algoLabel(algo);
    return ElectionAnalysis(
      headline: '$algoLabel result',
      summary: eduMessage,
      insights: [],
    );
  }

  // Step B: Determine verdict (excluding FPTP from consensus count).
  final nonFptp = Map.of(winnersMap)..remove('fptp');
  final allWinnerSets = nonFptp.values.map((w) => w.toSet()).toList();

  String verdict;
  String? consensusWinner;
  if (allWinnerSets.length <= 1) {
    // 0 or 1 non-FPTP algorithm — check all including FPTP.
    if (winnersMap.length <= 1) {
      verdict = 'single';
    } else {
      final allSets = winnersMap.values.map((w) => w.toSet()).toList();
      final first = allSets.first;
      if (allSets.every((s) => s.difference(first).isEmpty && first.difference(s).isEmpty)) {
        verdict = 'allAgree';
        consensusWinner = first.first;
      } else {
        verdict = 'mostAgree';
      }
    }
  } else {
    final first = allWinnerSets.first;
    final allSame = allWinnerSets.every(
        (s) => s.difference(first).isEmpty && first.difference(s).isEmpty);
    if (allSame) {
      verdict = 'allAgree';
      consensusWinner = first.first;
    } else {
      // Check if most agree.
      final winCounts = <String, int>{};
      for (final winners in nonFptp.values) {
        for (final w in winners) {
          winCounts[w] = (winCounts[w] ?? 0) + 1;
        }
      }
      final maxWins = winCounts.values.reduce((a, b) => a > b ? a : b);
      final leaders =
          winCounts.entries.where((e) => e.value == maxWins).toList();
      if (leaders.length == 1 && maxWins > 1) {
        verdict = 'mostAgree';
        consensusWinner = leaders.first.key;
      } else {
        verdict = 'allDisagree';
      }
    }
  }

  // Step C: Generate headline + summary.
  String headline;
  String summary;
  switch (verdict) {
    case 'allAgree':
      headline = 'Consensus: $consensusWinner wins across all methods';
      summary =
          '$consensusWinner won under every voting method, suggesting a strong, broadly supported choice.';
    case 'mostAgree':
      if (consensusWinner != null) {
        final agreeing = nonFptp.entries
            .where((e) => e.value.contains(consensusWinner))
            .length;
        final disagreeing = nonFptp.entries
            .where((e) => !e.value.contains(consensusWinner))
            .toList();
        final disagreeDesc = disagreeing
            .map((e) => '${_algoLabel(e.key)} selected ${e.value.first}')
            .join('; ');
        headline = 'Most methods agree: $consensusWinner';
        summary =
            '$consensusWinner won $agreeing of ${nonFptp.length} methods. $disagreeDesc.';
      } else {
        headline = 'Methods partially agree';
        summary =
            'Some voting methods chose the same winner, but not all agree on a single candidate.';
      }
    case 'allDisagree':
      headline = 'Each method chose a different winner';
      summary =
          'No single candidate won across multiple methods \u2014 the outcome depends on how preferences are counted.';
    default:
      final algo = results.first.algorithm;
      headline = '${_algoLabel(algo)} result';
      summary = _educationalMessage(algo);
  }

  // Step D: Generate conditional insights.
  final insights = <AnalysisInsight>[];
  final resultMap = {for (final r in results) r.algorithm: r};

  _tryFptpDiverges(resultMap, winnersMap, insights);
  _trySpoilerEffect(resultMap, winnersMap, insights);
  _tryStarRunoffFlip(resultMap, insights);
  _tryApprovalBreadth(resultMap, winnersMap, insights);
  _tryIrvVsApprovalDisagree(resultMap, winnersMap, insights);

  return ElectionAnalysis(
    headline: headline,
    summary: summary,
    insights: insights,
  );
}

// --- Insight generators ---

void _tryFptpDiverges(
  Map<String, ElectionResult> resultMap,
  Map<String, List<String>> winnersMap,
  List<AnalysisInsight> insights,
) {
  final fptpWinners = winnersMap['fptp'];
  if (fptpWinners == null || fptpWinners.isEmpty) return;

  final fptpWinner = fptpWinners.first;
  final nonFptp = Map.of(winnersMap)..remove('fptp');
  if (nonFptp.isEmpty) return;

  // Check if FPTP winner differs from ALL non-FPTP winners.
  final allDiffer =
      nonFptp.values.every((winners) => !winners.contains(fptpWinner));
  if (!allDiffer) return;

  final fptpData = resultMap['fptp']!.resultData;
  final fptpTallies = fptpData['tallies'] as Map<String, dynamic>? ?? {};
  final fptpTally = fptpTallies[fptpWinner] ?? '?';

  // Find the most common non-FPTP winner.
  final otherWinnerCounts = <String, int>{};
  for (final winners in nonFptp.values) {
    for (final w in winners) {
      otherWinnerCounts[w] = (otherWinnerCounts[w] ?? 0) + 1;
    }
  }
  final otherWinner = (otherWinnerCounts.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value)))
      .first
      .key;

  final methodNames = nonFptp.keys.map(_algoLabel).join(' and ');

  insights.add(AnalysisInsight(
    icon: Icons.compare_arrows,
    title: 'Plurality chose a different winner',
    body:
        'Under simple plurality, $fptpWinner won with $fptpTally first-choice votes. '
        'But $methodNames selected $otherWinner instead. '
        'This is common when similar candidates split the vote \u2014 '
        'ranked and rated methods are designed to look beyond just first choices.',
  ));
}

void _trySpoilerEffect(
  Map<String, ElectionResult> resultMap,
  Map<String, List<String>> winnersMap,
  List<AnalysisInsight> insights,
) {
  final irv = resultMap['irv'];
  final fptp = resultMap['fptp'];
  if (irv == null || fptp == null) return;

  final fptpWinner = winnersMap['fptp']?.firstOrNull;
  final irvWinner = winnersMap['irv']?.firstOrNull;
  if (fptpWinner == null || irvWinner == null) return;
  if (fptpWinner == irvWinner) return;

  // Check if FPTP winner was also the IRV first-round leader.
  final rounds = irv.resultData['rounds'] as List<dynamic>? ?? [];
  if (rounds.isEmpty) return;
  final firstRound = rounds.first as Map<String, dynamic>;
  final counts = firstRound['counts'] as Map<String, dynamic>? ?? {};
  if (counts.isEmpty) return;

  final firstRoundLeader = (counts.entries.toList()
        ..sort((a, b) => (b.value as num).compareTo(a.value as num)))
      .first;

  if (firstRoundLeader.key != fptpWinner) return;

  insights.add(AnalysisInsight(
    icon: Icons.group_remove,
    title: 'Potential spoiler effect',
    body:
        '$fptpWinner led in the first round of IRV with ${firstRoundLeader.value} votes \u2014 '
        'matching the plurality result. But after eliminating weaker candidates and '
        'redistributing their supporters\u2019 preferences, $irvWinner emerged as the winner. '
        'A candidate who splits the vote with $fptpWinner may have acted as a spoiler under plurality rules.',
  ));
}

void _tryStarRunoffFlip(
  Map<String, ElectionResult> resultMap,
  List<AnalysisInsight> insights,
) {
  final star = resultMap['star'];
  if (star == null) return;

  final data = star.resultData;
  final scores = data['scores'] as Map<String, dynamic>? ?? {};
  if (scores.isEmpty) return;

  final sorted = scores.entries.toList()
    ..sort((a, b) => (b.value as num).compareTo(a.value as num));
  final scoreLeader = sorted.first.key;
  final scoreLeaderScore = sorted.first.value;

  final winners = (data['winners'] as List<dynamic>?)?.cast<String>() ??
      (data['winner'] != null ? [data['winner'] as String] : <String>[]);
  if (winners.isEmpty) return;
  final starWinner = winners.first;

  if (scoreLeader == starWinner) return;

  final runoff = data['runoff'] as Map<String, dynamic>? ?? {};
  final prefCount = runoff[starWinner] ?? '?';
  final scoreLeaderPrefCount = runoff[scoreLeader] ?? '?';

  insights.add(AnalysisInsight(
    icon: Icons.swap_vert,
    title: 'STAR runoff changed the outcome',
    body:
        '$scoreLeader had the highest total score ($scoreLeaderScore points), '
        'but in the automatic head-to-head runoff, $starWinner was preferred by '
        '$prefCount voters vs $scoreLeaderPrefCount. '
        'STAR\u2019s two-phase design prevents a candidate with intense but narrow support '
        'from winning over one preferred by the broader group.',
  ));
}

void _tryApprovalBreadth(
  Map<String, ElectionResult> resultMap,
  Map<String, List<String>> winnersMap,
  List<AnalysisInsight> insights,
) {
  final approval = resultMap['approval'];
  final fptp = resultMap['fptp'];
  if (approval == null || fptp == null) return;

  final approvalWinner = winnersMap['approval']?.firstOrNull;
  final fptpWinner = winnersMap['fptp']?.firstOrNull;
  if (approvalWinner == null || fptpWinner == null) return;
  if (approvalWinner == fptpWinner) return;

  final approvalTallies =
      approval.resultData['tallies'] as Map<String, dynamic>? ?? {};
  final fptpTallies =
      fptp.resultData['tallies'] as Map<String, dynamic>? ?? {};

  final approvalCount = approvalTallies[approvalWinner] ?? '?';
  final approvalFptpTally = fptpTallies[approvalWinner] ?? '?';
  final fptpTally = fptpTallies[fptpWinner] ?? '?';
  final fptpApprovalTally = approvalTallies[fptpWinner] ?? '?';

  insights.add(AnalysisInsight(
    icon: Icons.pie_chart_outline,
    title: 'Broad support vs. first-choice support',
    body:
        '$approvalWinner was approved by $approvalCount voters \u2014 more than any other candidate \u2014 '
        'but only had $approvalFptpTally first-choice votes. '
        '$fptpWinner had the most first-choice votes ($fptpTally) but fewer total approvals ($fptpApprovalTally). '
        'Approval voting rewards candidates who are acceptable to the widest group, '
        'even if they aren\u2019t everyone\u2019s top pick.',
  ));
}

void _tryIrvVsApprovalDisagree(
  Map<String, ElectionResult> resultMap,
  Map<String, List<String>> winnersMap,
  List<AnalysisInsight> insights,
) {
  // Only fire when FPTP is absent (to avoid redundancy with insights 1/4).
  if (resultMap.containsKey('fptp')) return;

  final irv = resultMap['irv'];
  final approval = resultMap['approval'];
  if (irv == null || approval == null) return;

  final irvWinner = winnersMap['irv']?.firstOrNull;
  final approvalWinner = winnersMap['approval']?.firstOrNull;
  if (irvWinner == null || approvalWinner == null) return;
  if (irvWinner == approvalWinner) return;

  final approvalTallies =
      approval.resultData['tallies'] as Map<String, dynamic>? ?? {};
  final approvalCount = approvalTallies[approvalWinner] ?? '?';
  final rounds = irv.resultData['rounds'] as List<dynamic>? ?? [];
  final roundCount = rounds.length;

  insights.add(AnalysisInsight(
    icon: Icons.compare,
    title: 'Ranking and approval methods disagree',
    body:
        'Approval Voting selected $approvalWinner (approved by $approvalCount voters), '
        'while IRV selected $irvWinner after $roundCount rounds of elimination. '
        'This can happen when $approvalWinner is broadly acceptable but not many voters\u2019 top choice, '
        'while $irvWinner builds a majority through transferred preferences.',
  ));
}

// --- Helpers ---

String _algoLabel(String algorithm) => switch (algorithm) {
      'approval' => 'Approval Voting',
      'irv' => 'IRV',
      'star' => 'STAR Voting',
      'fptp' => 'First Past The Post',
      _ => algorithm,
    };

String _educationalMessage(String algorithm) => switch (algorithm) {
      'approval' =>
        'Approval voting selects the candidate acceptable to the most voters, favoring broadly liked candidates over polarizing ones.',
      'irv' =>
        'Instant Runoff Voting eliminates the least popular candidate each round, finding the candidate with the strongest overall preference.',
      'star' =>
        'STAR voting combines scoring with an automatic runoff, balancing intensity of support with breadth.',
      'fptp' =>
        'First Past the Post counts first choices \u2014 the most common method but vulnerable to vote splitting.',
      _ => 'Results for $algorithm.',
    };

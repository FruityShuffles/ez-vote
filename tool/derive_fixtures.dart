// Cross-language fixture generator for the ballot-derivation module (M23).
//
// This is a STANDALONE snapshot of the client-side derivation logic that lives
// in `lib/presentation/screens/ballot_screen.dart`. Flutter is frozen for the
// React migration, so rather than refactor the app we copy the relevant
// functions here VERBATIM (as pure top-level functions, with the State class's
// instance fields `_scores`/`_tieBreaks`/`_approvalCutoff`/`_approvalTopK`/
// `_fptpChoice` turned into parameters) and run them against fixed scenarios.
// The emitted JSON fixtures are the oracle that `supabase/functions/_shared/
// derive.ts` must match in CI — proving the TS reimplementation didn't drift.
//
// If `ballot_screen.dart` ever unfreezes and these rules change, re-copy the
// functions below and regenerate:  dart run tool/derive_fixtures.dart
//
// Source line ranges (at time of extraction):
//   _deriveRanking                271-302
//   _deriveApprovalsFromScores    305-310
//   _deriveApprovalsFromRanking   313-316
//   _syncTieBreaks/_getUiTied     214-246
//   _rebuildTieBreaksFromOrder    252-265
//   onReorder (#83/#78 branch)    888-924
//   _getTopScoredCandidates       1199-1204
//   _autoFptpFromScores           1208-1216
//   _buildPayload switch          1321-1349

import 'dart:convert';
import 'dart:io';

// ─── Verbatim derivation logic (parameterized; no UI, no instance state) ─────

/// _deriveRanking (271-302): score desc → tie-break order → candidate order.
List<String> deriveRanking(
  Map<String, int> scores,
  Map<int, List<String>> tieBreaks,
  List<String> candidateIds,
) {
  final Map<int, List<String>> byScore = {};
  for (final id in candidateIds) {
    final score = scores[id] ?? 0;
    byScore.putIfAbsent(score, () => []);
    byScore[score]!.add(id);
  }

  final result = <String>[];
  final sortedScores = byScore.keys.toList()..sort((a, b) => b.compareTo(a));

  for (final score in sortedScores) {
    final group = byScore[score]!;
    if (group.length == 1) {
      result.add(group.first);
    } else if (tieBreaks.containsKey(score)) {
      final tieOrder = tieBreaks[score]!;
      result.addAll(tieOrder.where((id) => group.contains(id)));
      for (final id in group) {
        if (!tieOrder.contains(id)) result.add(id);
      }
    } else {
      result.addAll(candidateIds.where((id) => group.contains(id)));
    }
  }
  return result;
}

/// _deriveApprovalsFromScores (305-310): score >= cutoff, candidate order.
List<String> deriveApprovalsFromScores(
  Map<String, int> scores,
  List<String> candidateIds,
  int cutoff,
) {
  return [
    for (final id in candidateIds)
      if ((scores[id] ?? 0) >= cutoff) id,
  ];
}

/// _deriveApprovalsFromRanking (313-316): first topK of ranking.
List<String> deriveApprovalsFromRanking(List<String> ranking, int topK) {
  if (topK <= 0) return [];
  return ranking.take(topK).toList();
}

/// _getUiTiedGroups (237-246): score>0 groups with 2+ members.
Map<int, List<String>> getUiTiedGroups(
  Map<String, int> scores,
  List<String> candidateIds,
) {
  final Map<int, List<String>> byScore = {};
  for (final id in candidateIds) {
    final score = scores[id] ?? 0;
    if (score == 0) continue;
    byScore.putIfAbsent(score, () => []);
    byScore[score]!.add(id);
  }
  return Map.fromEntries(byScore.entries.where((e) => e.value.length > 1));
}

/// _syncTieBreaks (214-234): maintain tie groups after a score change.
Map<int, List<String>> syncTieBreaks(
  Map<int, List<String>> tieBreaksIn,
  Map<String, int> scores,
  List<String> candidateIds,
) {
  final tieBreaks = {
    for (final e in tieBreaksIn.entries) e.key: List<String>.from(e.value)
  };
  final groups = getUiTiedGroups(scores, candidateIds);

  for (final entry in groups.entries) {
    final score = entry.key;
    final group = entry.value;
    if (!tieBreaks.containsKey(score)) {
      tieBreaks[score] = List.from(group);
    } else {
      final current = tieBreaks[score]!;
      for (final id in group) {
        if (!current.contains(id)) current.add(id);
      }
      current.removeWhere((id) => !group.contains(id));
    }
  }

  tieBreaks.removeWhere((score, _) => !groups.containsKey(score));
  return tieBreaks;
}

/// _rebuildTieBreaksFromOrder (252-265): group an explicit order by score,
/// keep groups with 2+ members (INCLUDING score 0).
Map<int, List<String>> rebuildTieBreaksFromOrder(
  List<String> order,
  Map<String, int> scores,
) {
  final Map<int, List<String>> tieBreaks = {};
  final Map<int, List<String>> byScore = {};
  for (final id in order) {
    final score = scores[id] ?? 0;
    byScore.putIfAbsent(score, () => []);
    byScore[score]!.add(id);
  }
  for (final entry in byScore.entries) {
    if (entry.value.length > 1) {
      tieBreaks[entry.key] = entry.value;
    }
  }
  return tieBreaks;
}

/// onReorder handler (888-924): the #83 (rank-first-score-later auto-bump) and
/// #78 (0-score reorder) logic. Pure: takes/returns {scores, tieBreaks, order}.
Map<String, dynamic> applyReorder(
  Map<String, int> scoresIn,
  List<String> displayOrder,
  int oldIndex,
  int newIndexRaw,
) {
  final scores = Map<String, int>.from(scoresIn);
  var newIndex = newIndexRaw;
  if (newIndex > oldIndex) newIndex--;
  final reordered = List<String>.from(displayOrder);
  final draggedId = reordered.removeAt(oldIndex);
  reordered.insert(newIndex, draggedId);

  final currentScore = scores[draggedId] ?? 0;
  final aboveIds = reordered.sublist(0, newIndex);
  final hasZeroAbove = aboveIds.any((id) => (scores[id] ?? 0) == 0);

  if (currentScore == 0 && !hasZeroAbove) {
    final newScore = aboveIds.isEmpty
        ? 5
        : (aboveIds.map((id) => scores[id] ?? 0).reduce((a, b) => a < b ? a : b) -
                1)
            .clamp(0, 5);
    scores[draggedId] = newScore;
  } else {
    final aboveScore =
        newIndex > 0 ? (scores[reordered[newIndex - 1]] ?? 0) : 5;
    final belowScore = newIndex < reordered.length - 1
        ? (scores[reordered[newIndex + 1]] ?? 0)
        : 0;
    scores[draggedId] = currentScore.clamp(belowScore, aboveScore);
  }

  final tieBreaks = rebuildTieBreaksFromOrder(reordered, scores);
  return {'scores': scores, 'tieBreaks': tieBreaks, 'order': reordered};
}

/// _getTopScoredCandidates (1199-1204): candidates at the (nonzero) max score.
List<String> getTopScoredCandidates(
  Map<String, int> scores,
  List<String> candidateIds,
) {
  var maxScore = 0;
  for (final id in candidateIds) {
    final s = scores[id] ?? 0;
    if (s > maxScore) maxScore = s;
  }
  if (maxScore == 0) return [];
  return [
    for (final id in candidateIds)
      if ((scores[id] ?? 0) == maxScore) id,
  ];
}

/// _autoFptpFromScores (1208-1216): single top auto-selects; clears when the
/// current choice falls out of the top set; otherwise preserved.
String? autoFptpFromScores(
  Map<String, int> scores,
  List<String> candidateIds,
  String? currentChoice,
) {
  final top = getTopScoredCandidates(scores, candidateIds);
  if (top.length == 1) {
    return top.first;
  } else if (currentChoice != null && !top.contains(currentChoice)) {
    return null;
  }
  return currentChoice;
}

/// _buildPayload switch (1321-1349): per-template assembly + trailing fptp.
Map<String, dynamic> buildPayload(
  String template,
  Map<String, dynamic> state,
  List<String> candidateIds,
  bool includeFptp,
) {
  final scores = (state['scores'] as Map?)?.cast<String, int>() ?? {};
  final rankings = (state['rankings'] as List?)?.cast<String>() ?? [];
  final approvals = (state['approvals'] as List?)?.cast<String>() ?? [];
  final tieBreaks = <int, List<String>>{
    for (final e in ((state['tieBreaks'] as Map?) ?? {}).entries)
      (e.key as int): (e.value as List).cast<String>(),
  };
  final cutoff = state['approvalCutoff'] as int? ?? 3;
  final topK = state['approvalTopK'] as int? ?? 0;
  final fptpChoice = state['fptpChoice'] as String?;

  final payload = <String, dynamic>{};
  switch (template) {
    case 'A':
      payload['irv'] = List<String>.from(rankings);
      break;
    case 'B':
      payload['star'] = Map<String, int>.from(scores);
      break;
    case 'C':
      payload['approval'] = List<String>.from(approvals);
      break;
    case 'D':
      payload['irv'] = List<String>.from(rankings);
      payload['approval'] = deriveApprovalsFromRanking(rankings, topK);
      break;
    case 'E':
      payload['star'] = Map<String, int>.from(scores);
      payload['approval'] =
          deriveApprovalsFromScores(scores, candidateIds, cutoff);
      break;
    case 'F':
      payload['star'] = Map<String, int>.from(scores);
      payload['irv'] = deriveRanking(scores, tieBreaks, candidateIds);
      break;
    case 'G':
      final ranking = deriveRanking(scores, tieBreaks, candidateIds);
      payload['star'] = Map<String, int>.from(scores);
      payload['irv'] = ranking;
      payload['approval'] = deriveApprovalsFromRanking(ranking, topK);
      break;
  }
  if (includeFptp && fptpChoice != null) {
    payload['fptp'] = fptpChoice;
  }
  return payload;
}

// ─── Fixture authoring ───────────────────────────────────────────────────────

final List<Map<String, dynamic>> _fixtures = [];

/// JSON keys must be strings; tie-break maps are int-keyed. Recursively
/// stringify Map<int,...> keys so input/expected serialize cleanly.
dynamic jsonify(dynamic v) {
  if (v is Map) {
    final out = <String, dynamic>{};
    v.forEach((k, val) => out[k.toString()] = jsonify(val));
    return out;
  }
  if (v is List) return v.map(jsonify).toList();
  return v;
}

void add(String name, String op, Map<String, dynamic> input, dynamic expected) {
  _fixtures.add({
    'name': name,
    'op': op,
    'description': _descriptions[name] ?? '',
    'input': jsonify(input),
    'expected': jsonify(expected),
  });
}

const _descriptions = <String, String>{
  'derive-ranking-clean': 'Distinct scores sort by score descending.',
  'derive-ranking-tie-explicit':
      'A tracked tie group uses the stored tie-break order.',
  'derive-ranking-tie-missing-member':
      'Tie-break order missing a group member appends it in candidate order.',
  'derive-ranking-untracked-tie':
      'A tie with no tie-break entry falls back to original candidate order.',
  'derive-ranking-all-zero':
      'All-zero scores keep original candidate order (no tie-break for 0).',
  'derive-ranking-zeros-at-bottom':
      'Zero-scored candidates sort last in candidate order.',
  'derive-ranking-zero-group-tiebreak':
      'A tie-break entry for score 0 (e.g. from a drag rebuild) is honored.',
  'approvals-from-scores-cutoff':
      'Approve candidates at or above the cutoff, in candidate order.',
  'approvals-from-scores-none': 'Nobody meets the cutoff → empty.',
  'approvals-from-scores-all': 'Cutoff 0 approves everyone.',
  'approvals-from-ranking-topk0': 'topK <= 0 yields no approvals.',
  'approvals-from-ranking-normal': 'Approve the first topK of the ranking.',
  'approvals-from-ranking-overflow': 'topK beyond length returns the whole ranking.',
  'sync-tiebreaks-new-tie': 'A newly-formed tie group is recorded.',
  'sync-tiebreaks-preserve-append':
      'Existing order preserved; newly-tied member appended at the end.',
  'sync-tiebreaks-member-leaves':
      'A candidate that left the score keeps the group but is dropped from it.',
  'sync-tiebreaks-group-dissolves': 'A group that is no longer tied is removed.',
  'sync-tiebreaks-ignore-zero': 'Score-0 ties are not tracked.',
  'rebuild-tiebreaks-basic': 'Rebuild groups from an explicit order.',
  'rebuild-tiebreaks-includes-zero':
      'Unlike sync, rebuild keeps a score-0 tie group (preserves drag order).',
  'rebuild-tiebreaks-multi-group': 'Multiple tie groups rebuilt from order.',
  'apply-reorder-83-drag-top-from-zero':
      '#83: dragging a 0-score candidate to the top from all-zero bumps it to 5.',
  'apply-reorder-83-next-under-top':
      '#83: the next 0-score candidate dragged just under the 5 becomes 4.',
  'apply-reorder-78-all-zero-persists':
      '#78 ex.1: reordering all-zero candidates now persists (carried in tieBreaks[0]).',
  'apply-reorder-78-scored-to-zero':
      '#78 ex.2: a scored candidate dragged among zeros drops to 0 and the order holds.',
  'apply-reorder-clamp-between':
      'A scored candidate dragged between neighbours is clamped to their range.',
  'auto-fptp-single': 'A single top scorer is auto-selected.',
  'auto-fptp-clear': 'The current choice is cleared when it is no longer top.',
  'auto-fptp-tie-preserve':
      'A tie at the top preserves an explicit current choice.',
  'auto-fptp-tie-null': 'A tie at the top with no choice stays null.',
  'auto-fptp-max-zero': 'No nonzero scores → no eligible FPTP candidate.',
  'build-payload-A': 'Template A: direct IRV rankings only.',
  'build-payload-B': 'Template B: direct STAR scores only.',
  'build-payload-C': 'Template C: direct approval set only.',
  'build-payload-D': 'Template D: direct rankings + top-K approvals.',
  'build-payload-E': 'Template E: scores + cutoff-derived approvals.',
  'build-payload-F': 'Template F: scores + score-derived IRV ranking.',
  'build-payload-G':
      'Template G: scores + derived ranking + top-K of that ranking.',
  'build-payload-fptp': 'includeFptp with a chosen candidate appends fptp.',
  'build-payload-fptp-null': 'includeFptp with no choice omits fptp.',
};

void buildAll() {
  // deriveRanking
  add('derive-ranking-clean', 'deriveRanking',
      {'scores': {'a': 5, 'b': 3, 'c': 1}, 'tieBreaks': <int, List<String>>{}, 'candidateIds': ['a', 'b', 'c']},
      deriveRanking({'a': 5, 'b': 3, 'c': 1}, {}, ['a', 'b', 'c']));
  add('derive-ranking-tie-explicit', 'deriveRanking',
      {'scores': {'a': 4, 'b': 4, 'c': 1}, 'tieBreaks': {4: ['b', 'a']}, 'candidateIds': ['a', 'b', 'c']},
      deriveRanking({'a': 4, 'b': 4, 'c': 1}, {4: ['b', 'a']}, ['a', 'b', 'c']));
  add('derive-ranking-tie-missing-member', 'deriveRanking',
      {'scores': {'a': 4, 'b': 4, 'c': 4}, 'tieBreaks': {4: ['c', 'a']}, 'candidateIds': ['a', 'b', 'c']},
      deriveRanking({'a': 4, 'b': 4, 'c': 4}, {4: ['c', 'a']}, ['a', 'b', 'c']));
  add('derive-ranking-untracked-tie', 'deriveRanking',
      {'scores': {'a': 4, 'b': 4, 'c': 1}, 'tieBreaks': <int, List<String>>{}, 'candidateIds': ['a', 'b', 'c']},
      deriveRanking({'a': 4, 'b': 4, 'c': 1}, {}, ['a', 'b', 'c']));
  add('derive-ranking-all-zero', 'deriveRanking',
      {'scores': <String, int>{}, 'tieBreaks': <int, List<String>>{}, 'candidateIds': ['a', 'b', 'c']},
      deriveRanking({}, {}, ['a', 'b', 'c']));
  add('derive-ranking-zeros-at-bottom', 'deriveRanking',
      {'scores': {'a': 5, 'b': 0, 'c': 0}, 'tieBreaks': <int, List<String>>{}, 'candidateIds': ['a', 'b', 'c']},
      deriveRanking({'a': 5, 'b': 0, 'c': 0}, {}, ['a', 'b', 'c']));
  add('derive-ranking-zero-group-tiebreak', 'deriveRanking',
      {'scores': {'a': 5, 'b': 0, 'c': 0}, 'tieBreaks': {0: ['c', 'b']}, 'candidateIds': ['a', 'b', 'c']},
      deriveRanking({'a': 5, 'b': 0, 'c': 0}, {0: ['c', 'b']}, ['a', 'b', 'c']));

  // approvalsFromScores
  add('approvals-from-scores-cutoff', 'deriveApprovalsFromScores',
      {'scores': {'a': 3, 'b': 2, 'c': 5}, 'candidateIds': ['a', 'b', 'c'], 'cutoff': 3},
      deriveApprovalsFromScores({'a': 3, 'b': 2, 'c': 5}, ['a', 'b', 'c'], 3));
  add('approvals-from-scores-none', 'deriveApprovalsFromScores',
      {'scores': {'a': 1, 'b': 2}, 'candidateIds': ['a', 'b'], 'cutoff': 3},
      deriveApprovalsFromScores({'a': 1, 'b': 2}, ['a', 'b'], 3));
  add('approvals-from-scores-all', 'deriveApprovalsFromScores',
      {'scores': {'a': 5, 'b': 4}, 'candidateIds': ['a', 'b'], 'cutoff': 0},
      deriveApprovalsFromScores({'a': 5, 'b': 4}, ['a', 'b'], 0));

  // approvalsFromRanking
  add('approvals-from-ranking-topk0', 'deriveApprovalsFromRanking',
      {'ranking': ['a', 'b', 'c'], 'topK': 0}, deriveApprovalsFromRanking(['a', 'b', 'c'], 0));
  add('approvals-from-ranking-normal', 'deriveApprovalsFromRanking',
      {'ranking': ['a', 'b', 'c'], 'topK': 2}, deriveApprovalsFromRanking(['a', 'b', 'c'], 2));
  add('approvals-from-ranking-overflow', 'deriveApprovalsFromRanking',
      {'ranking': ['a', 'b'], 'topK': 5}, deriveApprovalsFromRanking(['a', 'b'], 5));

  // syncTieBreaks
  add('sync-tiebreaks-new-tie', 'syncTieBreaks',
      {'tieBreaks': <int, List<String>>{}, 'scores': {'a': 4, 'b': 4, 'c': 1}, 'candidateIds': ['a', 'b', 'c']},
      syncTieBreaks({}, {'a': 4, 'b': 4, 'c': 1}, ['a', 'b', 'c']));
  add('sync-tiebreaks-preserve-append', 'syncTieBreaks',
      {'tieBreaks': {4: ['b', 'a']}, 'scores': {'a': 4, 'b': 4, 'c': 4}, 'candidateIds': ['a', 'b', 'c']},
      syncTieBreaks({4: ['b', 'a']}, {'a': 4, 'b': 4, 'c': 4}, ['a', 'b', 'c']));
  add('sync-tiebreaks-member-leaves', 'syncTieBreaks',
      {'tieBreaks': {4: ['a', 'b', 'c']}, 'scores': {'a': 4, 'b': 4, 'c': 1}, 'candidateIds': ['a', 'b', 'c']},
      syncTieBreaks({4: ['a', 'b', 'c']}, {'a': 4, 'b': 4, 'c': 1}, ['a', 'b', 'c']));
  add('sync-tiebreaks-group-dissolves', 'syncTieBreaks',
      {'tieBreaks': {4: ['a', 'b']}, 'scores': {'a': 4, 'b': 2, 'c': 1}, 'candidateIds': ['a', 'b', 'c']},
      syncTieBreaks({4: ['a', 'b']}, {'a': 4, 'b': 2, 'c': 1}, ['a', 'b', 'c']));
  add('sync-tiebreaks-ignore-zero', 'syncTieBreaks',
      {'tieBreaks': <int, List<String>>{}, 'scores': {'a': 0, 'b': 0}, 'candidateIds': ['a', 'b']},
      syncTieBreaks({}, {'a': 0, 'b': 0}, ['a', 'b']));

  // rebuildTieBreaksFromOrder
  add('rebuild-tiebreaks-basic', 'rebuildTieBreaksFromOrder',
      {'order': ['b', 'a', 'c'], 'scores': {'a': 4, 'b': 4, 'c': 1}},
      rebuildTieBreaksFromOrder(['b', 'a', 'c'], {'a': 4, 'b': 4, 'c': 1}));
  add('rebuild-tiebreaks-includes-zero', 'rebuildTieBreaksFromOrder',
      {'order': ['a', 'c', 'b'], 'scores': {'a': 5, 'b': 0, 'c': 0}},
      rebuildTieBreaksFromOrder(['a', 'c', 'b'], {'a': 5, 'b': 0, 'c': 0}));
  add('rebuild-tiebreaks-multi-group', 'rebuildTieBreaksFromOrder',
      {'order': ['a', 'b', 'c', 'd'], 'scores': {'a': 4, 'b': 4, 'c': 2, 'd': 2}},
      rebuildTieBreaksFromOrder(['a', 'b', 'c', 'd'], {'a': 4, 'b': 4, 'c': 2, 'd': 2}));

  // applyReorder (#83 / #78)
  add('apply-reorder-83-drag-top-from-zero', 'applyReorder',
      {'scores': {'a': 0, 'b': 0, 'c': 0}, 'displayOrder': ['a', 'b', 'c'], 'oldIndex': 2, 'newIndex': 0},
      applyReorder({'a': 0, 'b': 0, 'c': 0}, ['a', 'b', 'c'], 2, 0));
  add('apply-reorder-83-next-under-top', 'applyReorder',
      {'scores': {'c': 5, 'a': 0, 'b': 0}, 'displayOrder': ['c', 'a', 'b'], 'oldIndex': 2, 'newIndex': 1},
      applyReorder({'c': 5, 'a': 0, 'b': 0}, ['c', 'a', 'b'], 2, 1));
  add('apply-reorder-78-all-zero-persists', 'applyReorder',
      {'scores': {'a': 0, 'b': 0, 'c': 0}, 'displayOrder': ['a', 'b', 'c'], 'oldIndex': 0, 'newIndex': 2},
      applyReorder({'a': 0, 'b': 0, 'c': 0}, ['a', 'b', 'c'], 0, 2));
  add('apply-reorder-78-scored-to-zero', 'applyReorder',
      {'scores': {'c': 1, 'b': 0, 'a': 0}, 'displayOrder': ['c', 'b', 'a'], 'oldIndex': 0, 'newIndex': 2},
      applyReorder({'c': 1, 'b': 0, 'a': 0}, ['c', 'b', 'a'], 0, 2));
  add('apply-reorder-clamp-between', 'applyReorder',
      {'scores': {'a': 5, 'b': 3, 'c': 1}, 'displayOrder': ['a', 'b', 'c'], 'oldIndex': 2, 'newIndex': 1},
      applyReorder({'a': 5, 'b': 3, 'c': 1}, ['a', 'b', 'c'], 2, 1));

  // autoFptpFromScores
  add('auto-fptp-single', 'autoFptpFromScores',
      {'scores': {'a': 5, 'b': 3}, 'candidateIds': ['a', 'b'], 'currentChoice': null},
      autoFptpFromScores({'a': 5, 'b': 3}, ['a', 'b'], null));
  add('auto-fptp-clear', 'autoFptpFromScores',
      {'scores': {'a': 3, 'b': 5}, 'candidateIds': ['a', 'b'], 'currentChoice': 'a'},
      autoFptpFromScores({'a': 3, 'b': 5}, ['a', 'b'], 'a'));
  add('auto-fptp-tie-preserve', 'autoFptpFromScores',
      {'scores': {'a': 5, 'b': 5}, 'candidateIds': ['a', 'b'], 'currentChoice': 'a'},
      autoFptpFromScores({'a': 5, 'b': 5}, ['a', 'b'], 'a'));
  add('auto-fptp-tie-null', 'autoFptpFromScores',
      {'scores': {'a': 5, 'b': 5}, 'candidateIds': ['a', 'b'], 'currentChoice': null},
      autoFptpFromScores({'a': 5, 'b': 5}, ['a', 'b'], null));
  add('auto-fptp-max-zero', 'autoFptpFromScores',
      {'scores': {'a': 0, 'b': 0}, 'candidateIds': ['a', 'b'], 'currentChoice': null},
      autoFptpFromScores({'a': 0, 'b': 0}, ['a', 'b'], null));

  // buildPayload
  const ids = ['a', 'b', 'c'];
  add('build-payload-A', 'buildPayload',
      {'template': 'A', 'state': {'rankings': ['a', 'b', 'c']}, 'candidateIds': ids, 'includeFptp': false},
      buildPayload('A', {'rankings': ['a', 'b', 'c']}, ids, false));
  add('build-payload-B', 'buildPayload',
      {'template': 'B', 'state': {'scores': {'a': 5, 'b': 3}}, 'candidateIds': ids, 'includeFptp': false},
      buildPayload('B', {'scores': {'a': 5, 'b': 3}}, ids, false));
  add('build-payload-C', 'buildPayload',
      {'template': 'C', 'state': {'approvals': ['a', 'c']}, 'candidateIds': ids, 'includeFptp': false},
      buildPayload('C', {'approvals': ['a', 'c']}, ids, false));
  add('build-payload-D', 'buildPayload',
      {'template': 'D', 'state': {'rankings': ['a', 'b', 'c'], 'approvalTopK': 2}, 'candidateIds': ids, 'includeFptp': false},
      buildPayload('D', {'rankings': ['a', 'b', 'c'], 'approvalTopK': 2}, ids, false));
  add('build-payload-E', 'buildPayload',
      {'template': 'E', 'state': {'scores': {'a': 4, 'b': 2, 'c': 5}, 'approvalCutoff': 3}, 'candidateIds': ids, 'includeFptp': false},
      buildPayload('E', {'scores': {'a': 4, 'b': 2, 'c': 5}, 'approvalCutoff': 3}, ids, false));
  add('build-payload-F', 'buildPayload',
      {'template': 'F', 'state': {'scores': {'a': 5, 'b': 3, 'c': 3}, 'tieBreaks': {3: ['c', 'b']}}, 'candidateIds': ids, 'includeFptp': false},
      buildPayload('F', {'scores': {'a': 5, 'b': 3, 'c': 3}, 'tieBreaks': {3: ['c', 'b']}}, ids, false));
  add('build-payload-G', 'buildPayload',
      {'template': 'G', 'state': {'scores': {'a': 5, 'b': 3, 'c': 3}, 'tieBreaks': {3: ['c', 'b']}, 'approvalTopK': 2}, 'candidateIds': ids, 'includeFptp': false},
      buildPayload('G', {'scores': {'a': 5, 'b': 3, 'c': 3}, 'tieBreaks': {3: ['c', 'b']}, 'approvalTopK': 2}, ids, false));
  add('build-payload-fptp', 'buildPayload',
      {'template': 'B', 'state': {'scores': {'a': 5}, 'fptpChoice': 'a'}, 'candidateIds': ids, 'includeFptp': true},
      buildPayload('B', {'scores': {'a': 5}, 'fptpChoice': 'a'}, ids, true));
  add('build-payload-fptp-null', 'buildPayload',
      {'template': 'B', 'state': {'scores': {'a': 5}, 'fptpChoice': null}, 'candidateIds': ids, 'includeFptp': true},
      buildPayload('B', {'scores': {'a': 5}, 'fptpChoice': null}, ids, true));
}

void main() {
  buildAll();

  final outDir = Directory.fromUri(
    Platform.script.resolve('../supabase/functions/_shared/fixtures/derivation/'),
  );
  outDir.createSync(recursive: true);

  final encoder = const JsonEncoder.withIndent('  ');
  for (final fx in _fixtures) {
    final file = File.fromUri(outDir.uri.resolve('${fx['name']}.json'));
    file.writeAsStringSync('${encoder.convert(fx)}\n');
  }
  stdout.writeln('Wrote ${_fixtures.length} derivation fixtures to ${outDir.path}');
}

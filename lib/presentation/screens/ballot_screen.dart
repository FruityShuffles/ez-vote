import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:convert';

import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../widgets/dashboard_button.dart';
import '../../domain/models/candidate.dart';
import '../../domain/models/ballot.dart';
import '../../domain/models/election.dart';

class BallotScreen extends ConsumerStatefulWidget {
  final String electionId;
  final Ballot? initialBallot;
  final bool viewOnly;

  const BallotScreen({
    super.key,
    required this.electionId,
    this.initialBallot,
    this.viewOnly = false,
  });

  @override
  ConsumerState<BallotScreen> createState() => _BallotScreenState();
}

class _BallotScreenState extends ConsumerState<BallotScreen> {
  // STAR: source of truth when STAR present
  Map<String, int> _scores = {};

  // IRV-only: direct ranking (no STAR)
  List<String> _rankings = [];

  // Approval-only: direct checkboxes (no STAR, no IRV)
  final Set<String> _approvals = {};

  // Derivation settings
  int _approvalCutoff = 3; // STAR+Approval: approve where score >= cutoff
  int _approvalTopK = 0;   // IRV+Approval or STAR+IRV+Approval: approve top N

  // Tie-break state: score → ordered list of tied candidate IDs (score > 0 only)
  final Map<int, List<String>> _tieBreaks = {};

  // Animated reorder offsets for score-driven position changes (Templates F/G)
  Map<String, Offset> _slideOffsets = {};

  bool _loading = false;
  bool _initialized = false;

  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) => _pollCandidates());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _pollCandidates() async {
    final election =
        ref.read(electionProvider(widget.electionId)).valueOrNull;
    if (election == null ||
        !election.allowVoterCandidates ||
        election.status != ElectionStatus.open) {
      return;
    }

    final freshCount = await ref
        .read(candidateRepositoryProvider)
        .countForElection(widget.electionId);
    final cached =
        ref.read(candidatesProvider(widget.electionId)).valueOrNull;
    if (cached != null && freshCount != cached.length) {
      final freshCandidates = await ref
          .read(candidateRepositoryProvider)
          .listForElection(widget.electionId);
      _mergeNewCandidates(freshCandidates, election.algorithms);
      ref.invalidate(candidatesProvider(widget.electionId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text(
                  'Candidates have been updated — your ballot has been adjusted')),
        );
        setState(() {});
      }
    }
  }

  void _mergeNewCandidates(List<Candidate> freshCandidates, List<String> algos) {
    final currentIds = freshCandidates.map((c) => c.id).toSet();

    if (algos.contains('star')) {
      for (final id in currentIds) {
        _scores.putIfAbsent(id, () => 0);
      }
      _scores.removeWhere((id, _) => !currentIds.contains(id));
      _syncTieBreaks(freshCandidates);
    }

    if (algos.contains('irv') && !algos.contains('star')) {
      _rankings.removeWhere((id) => !currentIds.contains(id));
      for (final id in currentIds) {
        if (!_rankings.contains(id)) _rankings.add(id);
      }
    }

    if (algos.contains('approval') &&
        !algos.contains('star') &&
        !algos.contains('irv')) {
      _approvals.removeWhere((id) => !currentIds.contains(id));
    }
  }

  // ── Initialization ────────────────────────────────────────────────────────

  void _initializeState(List<Candidate> candidates, List<String> algos) {
    if (_initialized) return;
    _initialized = true;

    if (algos.contains('star')) {
      _scores = {for (final c in candidates) c.id: 0};
    }
    if (algos.contains('irv') && !algos.contains('star') &&
        candidates.isNotEmpty) {
      _rankings = candidates.map((c) => c.id).toList();
    }

    final currentIds = candidates.map((c) => c.id).toSet();

    final payload = widget.initialBallot?.payload;
    if (payload != null) {
      if (payload['star'] != null) {
        final raw = payload['star'] as Map<String, dynamic>;
        _scores = raw.map((k, v) => MapEntry(k, (v as num).toInt()));
        // Add new candidates with score 0, remove deleted candidates
        for (final id in currentIds) {
          _scores.putIfAbsent(id, () => 0);
        }
        _scores.removeWhere((id, _) => !currentIds.contains(id));
      }
      if (payload['irv'] != null && !algos.contains('star')) {
        _rankings = List<String>.from(payload['irv'] as List);
        // Remove deleted candidates, append new ones at the end
        _rankings.removeWhere((id) => !currentIds.contains(id));
        for (final id in currentIds) {
          if (!_rankings.contains(id)) _rankings.add(id);
        }
      }
      if (payload['approval'] != null) {
        final savedApprovals = List<String>.from(payload['approval'] as List)
          ..removeWhere((id) => !currentIds.contains(id));
        if (!algos.contains('star') && !algos.contains('irv')) {
          // Template C: restore approvals directly
          _approvals.addAll(savedApprovals);
        } else if (algos.contains('star') && !algos.contains('irv')) {
          // Template E: derive cutoff = min score among approved candidates
          if (savedApprovals.isNotEmpty) {
            _approvalCutoff = savedApprovals
                .map((id) => _scores[id] ?? 0)
                .reduce((a, b) => a < b ? a : b);
          }
        } else {
          // Templates D (IRV+Approval) and G (STAR+IRV+Approval): set topK
          _approvalTopK = savedApprovals.length;
        }
      }
      if (algos.contains('star')) _syncTieBreaks(candidates);
    }
  }

  // ── Tie-break management ──────────────────────────────────────────────────

  /// Keep _tieBreaks in sync with current scores after any score change.
  /// Only tracks score > 0 tie groups (2+ candidates at same non-zero score).
  void _syncTieBreaks(List<Candidate> candidates) {
    final groups = _getUiTiedGroups(candidates);

    // Add/update groups
    for (final entry in groups.entries) {
      final score = entry.key;
      final group = entry.value;
      if (!_tieBreaks.containsKey(score)) {
        _tieBreaks[score] = List.from(group);
      } else {
        final current = _tieBreaks[score]!;
        for (final id in group) {
          if (!current.contains(id)) current.add(id);
        }
        current.removeWhere((id) => !group.contains(id));
      }
    }

    // Remove groups that no longer exist
    _tieBreaks.removeWhere((score, _) => !groups.containsKey(score));
  }

  /// Returns tie groups with score > 0 and 2+ candidates.
  Map<int, List<String>> _getUiTiedGroups(List<Candidate> candidates) {
    final Map<int, List<String>> byScore = {};
    for (final c in candidates) {
      final score = _scores[c.id] ?? 0;
      if (score == 0) continue;
      byScore.putIfAbsent(score, () => []);
      byScore[score]!.add(c.id);
    }
    return Map.fromEntries(byScore.entries.where((e) => e.value.length > 1));
  }

  // ── Tie-break rebuild from explicit order (for reorderable F/G) ──────────

  /// Rebuild _tieBreaks from an explicit display order list.
  /// Groups candidates by score and preserves list order within each group.
  void _rebuildTieBreaksFromOrder(List<String> order) {
    _tieBreaks.clear();
    final Map<int, List<String>> byScore = {};
    for (final id in order) {
      final score = _scores[id] ?? 0;
      byScore.putIfAbsent(score, () => []);
      byScore[score]!.add(id);
    }
    for (final entry in byScore.entries) {
      if (entry.value.length > 1 && entry.key > 0) {
        _tieBreaks[entry.key] = entry.value;
      }
    }
  }

  // ── Pure derivation functions ─────────────────────────────────────────────

  /// Sort by score desc; within tied groups, use _tieBreaks order if set,
  /// otherwise fall back to original candidate list order.
  List<String> _deriveRanking(List<Candidate> candidates) {
    final Map<int, List<String>> byScore = {};
    for (final c in candidates) {
      final score = _scores[c.id] ?? 0;
      byScore.putIfAbsent(score, () => []);
      byScore[score]!.add(c.id);
    }

    final result = <String>[];
    final sortedScores = byScore.keys.toList()..sort((a, b) => b.compareTo(a));

    for (final score in sortedScores) {
      final group = byScore[score]!;
      if (group.length == 1) {
        result.add(group.first);
      } else if (score > 0 && _tieBreaks.containsKey(score)) {
        final tieOrder = _tieBreaks[score]!;
        // Use stored order, filtered to only members of this group
        result.addAll(tieOrder.where((id) => group.contains(id)));
        // Add any missing members at the end
        for (final id in group) {
          if (!tieOrder.contains(id)) result.add(id);
        }
      } else {
        // Default: stable order from original candidate list
        result.addAll(
          candidates.where((c) => group.contains(c.id)).map((c) => c.id),
        );
      }
    }
    return result;
  }

  /// Approve candidates where score >= _approvalCutoff (inclusive).
  Set<String> _deriveApprovalsFromScores(List<Candidate> candidates) {
    return {
      for (final c in candidates)
        if ((_scores[c.id] ?? 0) >= _approvalCutoff) c.id,
    };
  }

  /// Approve the first _approvalTopK entries of the ranking.
  Set<String> _deriveApprovalsFromRanking(List<String> ranking) {
    if (_approvalTopK <= 0) return {};
    return ranking.take(_approvalTopK).toSet();
  }

  // ── Template selection ────────────────────────────────────────────────────

  String _getTemplate(List<String> algos) {
    final hasA = algos.contains('approval');
    final hasI = algos.contains('irv');
    final hasS = algos.contains('star');

    if (hasS && hasI && hasA) return 'G';
    if (hasS && hasI) return 'F';
    if (hasS && hasA) return 'E';
    if (hasI && hasA) return 'D';
    if (hasA) return 'C';
    if (hasI) return 'A';
    return 'B'; // STAR only (default)
  }

  // ── Validation ────────────────────────────────────────────────────────────

  List<String> _getBlockingErrors(List<Candidate> candidates, String template) {
    switch (template) {
      case 'B':
      case 'E':
      case 'F':
      case 'G':
        if (candidates.every((c) => (_scores[c.id] ?? 0) == 0)) {
          return ['Rate at least one candidate above 0'];
        }
    }
    return [];
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final electionAsync = ref.watch(electionProvider(widget.electionId));
    final candidatesAsync = ref.watch(candidatesProvider(widget.electionId));

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.viewOnly
            ? 'View Ballot'
            : (widget.initialBallot != null ? 'Edit Ballot' : 'Cast Your Vote')),
        actions: const [DashboardButton()],
      ),
      body: electionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (election) {
          return candidatesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (candidates) {
              _initializeState(candidates, election.algorithms);
              final template = _getTemplate(election.algorithms);
              final errors = _getBlockingErrors(candidates, template);

              return SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 600),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(election.title,
                            style:
                                Theme.of(context).textTheme.headlineSmall),
                        if (election.description != null) ...[
                          const SizedBox(height: 8),
                          Text(election.description!,
                              style:
                                  Theme.of(context).textTheme.bodyMedium),
                        ],
                        const SizedBox(height: 24),
                        IgnorePointer(
                          ignoring: widget.viewOnly,
                          child: _buildTemplate(template, candidates),
                        ),
                        const SizedBox(height: 16),
                        if (widget.viewOnly) ...[
                          Text(
                            'This election is closed. Your ballot is view-only.',
                            style: TextStyle(color: Colors.grey.shade600),
                          ),
                        ] else ...[
                          if (errors.isNotEmpty) ...[
                            ...errors.map((e) => Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.error_outline,
                                          color: Colors.red, size: 16),
                                      const SizedBox(width: 8),
                                      Text(e,
                                          style: const TextStyle(
                                              color: Colors.red)),
                                    ],
                                  ),
                                )),
                            const SizedBox(height: 8),
                          ],
                          FilledButton.icon(
                            onPressed: (_loading || errors.isNotEmpty)
                                ? null
                                : () => _submit(candidates, template),
                            icon: const Icon(Icons.how_to_vote),
                            label: _loading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : Text(widget.initialBallot != null
                                    ? 'Update Ballot'
                                    : 'Submit Ballot'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildTemplate(String template, List<Candidate> candidates) {
    switch (template) {
      case 'A': return _buildTemplateA(candidates);
      case 'B': return _buildTemplateB(candidates);
      case 'C': return _buildTemplateC(candidates);
      case 'D': return _buildTemplateD(candidates);
      case 'E': return _buildTemplateE(candidates);
      case 'F': return _buildTemplateF(candidates);
      case 'G': return _buildTemplateG(candidates);
      default:  return const SizedBox.shrink();
    }
  }

  // ── Template A: IRV only ──────────────────────────────────────────────────

  Widget _buildTemplateA(List<Candidate> candidates) {
    final candidateMap = {for (final c in candidates) c.id: c};
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Rank Your Preferences',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text(
                'Drag candidates into your preferred order. #1 is your top choice.'),
            const SizedBox(height: 8),
            ReorderableListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _rankings.length,
              onReorder: (oldIndex, newIndex) {
                setState(() {
                  if (newIndex > oldIndex) newIndex--;
                  final item = _rankings.removeAt(oldIndex);
                  _rankings.insert(newIndex, item);
                });
              },
              itemBuilder: (context, index) {
                final candidate = candidateMap[_rankings[index]];
                return ReorderableDragStartListener(
                  key: ValueKey(_rankings[index]),
                  index: index,
                  child: MouseRegion(
                    cursor: SystemMouseCursors.grab,
                    child: ListTile(
                      leading: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.drag_indicator,
                              size: 20, color: Colors.grey),
                          const SizedBox(width: 4),
                          CircleAvatar(child: Text('${index + 1}')),
                        ],
                      ),
                      title: Text(candidate?.name ?? 'Unknown'),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  // ── Template B: STAR only ─────────────────────────────────────────────────

  Widget _buildTemplateB(List<Candidate> candidates) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Rate Each Candidate',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text(
                'Give each candidate a score from 0 (no support) to 5 (strongest support).'),
            const SizedBox(height: 8),
            ...candidates.map((c) => _buildStarCandidateRow(c, candidates)),
          ],
        ),
      ),
    );
  }

  // ── Template C: Approval only ─────────────────────────────────────────────

  Widget _buildTemplateC(List<Candidate> candidates) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Approve Candidates',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text(
                'Check every candidate you\'d be happy to see win.'),
            const SizedBox(height: 8),
            ...candidates.map((c) => CheckboxListTile(
                  title: Text(c.name),
                  value: _approvals.contains(c.id),
                  onChanged: (checked) {
                    setState(() {
                      if (checked == true) {
                        _approvals.add(c.id);
                      } else {
                        _approvals.remove(c.id);
                      }
                    });
                  },
                )),
          ],
        ),
      ),
    );
  }

  // ── Template D: IRV + Approval ────────────────────────────────────────────

  Widget _buildTemplateD(List<Candidate> candidates) {
    final candidateMap = {for (final c in candidates) c.id: c};
    final approvedSet = _deriveApprovalsFromRanking(_rankings);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Rank & Approve Candidates',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text(
                'Drag candidates into your preferred order. #1 is your top choice.'),
            const SizedBox(height: 4),
            const Text(
                'Then choose how many of your top-ranked candidates to approve.'),
            const SizedBox(height: 12),
            _buildApprovalStepperCard(
              child: _buildTopKStepper(candidates.length, 'candidates'),
            ),
            const SizedBox(height: 8),
            ReorderableListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _rankings.length,
              onReorder: (oldIndex, newIndex) {
                setState(() {
                  if (newIndex > oldIndex) newIndex--;
                  final item = _rankings.removeAt(oldIndex);
                  _rankings.insert(newIndex, item);
                });
              },
              itemBuilder: (context, index) {
                final id = _rankings[index];
                final candidate = candidateMap[id];
                final isApproved = approvedSet.contains(id);
                return ReorderableDragStartListener(
                  key: ValueKey(id),
                  index: index,
                  child: MouseRegion(
                    cursor: SystemMouseCursors.grab,
                    child: ListTile(
                      leading: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.drag_indicator,
                              size: 20, color: Colors.grey),
                          const SizedBox(width: 4),
                          CircleAvatar(child: Text('${index + 1}')),
                        ],
                      ),
                      title: Text(candidate?.name ?? 'Unknown'),
                      trailing: isApproved ? _approvedBadge() : null,
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  // ── Template E: STAR + Approval ───────────────────────────────────────────

  Widget _buildTemplateE(List<Candidate> candidates) {
    final approvedSet = _deriveApprovalsFromScores(candidates);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Rate & Approve Candidates',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text(
                'Give each candidate a score from 0 (no support) to 5 (strongest support).'),
            const SizedBox(height: 4),
            const Text(
                'Then set a threshold \u2014 candidates at or above that score are approved.'),
            const SizedBox(height: 12),
            _buildApprovalStepperCard(
              child: Row(
                children: [
                  const Text('Approval threshold: score \u2265 '),
                  IconButton(
                    icon: const Icon(Icons.remove),
                    onPressed: _approvalCutoff > 0
                        ? () => setState(() => _approvalCutoff--)
                        : null,
                  ),
                  Text('$_approvalCutoff',
                      style: Theme.of(context).textTheme.titleMedium),
                  IconButton(
                    icon: const Icon(Icons.add),
                    onPressed: _approvalCutoff < 5
                        ? () => setState(() => _approvalCutoff++)
                        : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            ...candidates.map((c) => _buildStarCandidateRow(
                  c, candidates,
                  isApproved: approvedSet.contains(c.id))),
          ],
        ),
      ),
    );
  }

  // ── Template F: STAR + IRV ────────────────────────────────────────────────

  Widget _buildTemplateF(List<Candidate> candidates) {
    return _buildReorderableStarList(candidates, showApproval: false);
  }

  // ── Template G: STAR + IRV + Approval ────────────────────────────────────

  Widget _buildTemplateG(List<Candidate> candidates) {
    return _buildReorderableStarList(candidates, showApproval: true);
  }

  // ── Reorderable STAR list (Templates F & G) ──────────────────────────────

  Widget _buildReorderableStarList(List<Candidate> candidates,
      {required bool showApproval}) {
    final sortedIds = _deriveRanking(candidates);
    final candidateMap = {for (final c in candidates) c.id: c};
    final approvedSet = showApproval
        ? _deriveApprovalsFromRanking(sortedIds)
        : <String>{};

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(showApproval ? 'Rate, Rank & Approve' : 'Rate & Rank Candidates',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text(
                'Give each candidate a score from 0 (no support) to 5 (strongest support). The list automatically sorts by score to create your ranking.'),
            const SizedBox(height: 4),
            const Text(
                'To fine-tune the order, drag candidates up or down \u2014 their scores will adjust to stay consistent with the new position.'),
            if (showApproval) ...[
              const SizedBox(height: 4),
              const Text(
                  'Finally, choose how many of your top-ranked candidates to approve.'),
              const SizedBox(height: 12),
              _buildApprovalStepperCard(
                child: _buildTopKStepper(
                    candidates.length, 'candidates (by rank order)'),
              ),
            ],
            const SizedBox(height: 8),
            ReorderableListView.builder(
              shrinkWrap: true,
              clipBehavior: Clip.none,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: sortedIds.length,
              onReorder: (oldIndex, newIndex) {
                setState(() {
                  if (newIndex > oldIndex) newIndex--;
                  final reordered = List<String>.from(sortedIds);
                  final draggedId = reordered.removeAt(oldIndex);
                  reordered.insert(newIndex, draggedId);

                  // Adjust score to fit between neighbors
                  final aboveScore = newIndex > 0
                      ? (_scores[reordered[newIndex - 1]] ?? 0)
                      : 5;
                  final belowScore = newIndex < reordered.length - 1
                      ? (_scores[reordered[newIndex + 1]] ?? 0)
                      : 0;
                  final currentScore = _scores[draggedId] ?? 0;
                  _scores[draggedId] = currentScore.clamp(belowScore, aboveScore);

                  _rebuildTieBreaksFromOrder(reordered);
                });
              },
              itemBuilder: (context, index) {
                final id = sortedIds[index];
                final candidate = candidateMap[id];
                return _buildReorderableStarRow(
                  index: index,
                  candidateId: id,
                  candidateName: candidate?.name ?? 'Unknown',
                  candidates: candidates,
                  isApproved: approvedSet.contains(id),
                  showApproval: showApproval,
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReorderableStarRow({
    required int index,
    required String candidateId,
    required String candidateName,
    required List<Candidate> candidates,
    required bool isApproved,
    required bool showApproval,
  }) {
    return Padding(
      key: ValueKey(candidateId),
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 0),
      child: AnimatedSlide(
        offset: _slideOffsets[candidateId] ?? Offset.zero,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ReorderableDragStartListener(
              index: index,
              child: MouseRegion(
                cursor: SystemMouseCursors.grab,
                child: Row(
                  children: [
                    const Icon(Icons.drag_indicator,
                        size: 20, color: Colors.grey),
                    const SizedBox(width: 4),
                    CircleAvatar(
                      radius: 14,
                      backgroundColor: Colors.blue.shade100,
                      child: Text('${index + 1}',
                          style: const TextStyle(fontSize: 12)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 6,
                        children: [
                          Text(candidateName,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w500)),
                          if (showApproval && isApproved) _approvedBadge(),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: _buildScoreChipsForReorderable(candidateId, candidates),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildScoreChipsForReorderable(
      String candidateId, List<Candidate> candidates) {
    return List.generate(6, (i) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 1),
        child: ChoiceChip(
          label: Text('$i'),
          selected: (_scores[candidateId] ?? 0) == i,
          onSelected: (_) {
            // Capture old order BEFORE changing score
            final oldOrder = _deriveRanking(candidates);

            // Update score and compute new order
            _scores[candidateId] = i;
            final newOrder = List<String>.from(oldOrder);
            newOrder.sort((a, b) =>
                (_scores[b] ?? 0).compareTo(_scores[a] ?? 0));
            _rebuildTieBreaksFromOrder(newOrder);

            // Compute slide offsets: each item starts at its old visual
            // position and animates to its new position
            _slideOffsets = {};
            for (int idx = 0; idx < newOrder.length; idx++) {
              final id = newOrder[idx];
              final oldIdx = oldOrder.indexOf(id);
              if (oldIdx != idx) {
                _slideOffsets[id] = Offset(0, (oldIdx - idx).toDouble());
              }
            }

            setState(() {});

            // Clear offsets on next frame so AnimatedSlide animates to zero
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                setState(() {
                  _slideOffsets = {};
                });
              }
            });
          },
        ),
      );
    });
  }

  // ── Shared UI helpers ─────────────────────────────────────────────────────

  Widget _irvBadge(int? position) {
    if (position == null) return const SizedBox(width: 40);
    return SizedBox(
      width: 40,
      child: Tooltip(
        message: 'IRV rank $position',
        child: CircleAvatar(
          radius: 14,
          backgroundColor: Colors.blue.shade100,
          child: Text('$position', style: const TextStyle(fontSize: 12)),
        ),
      ),
    );
  }

  Widget _approvedBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.green,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Text('Approved',
          style: TextStyle(color: Colors.white, fontSize: 12)),
    );
  }

  Widget _buildStarCandidateRow(
    Candidate c,
    List<Candidate> candidates, {
    int? irvRank,
    bool isApproved = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            if (irvRank != null) ...[
              _irvBadge(irvRank),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 6,
                children: [
                  Text(c.name,
                      style:
                          const TextStyle(fontWeight: FontWeight.w500)),
                  if (isApproved) _approvedBadge(),
                ],
              ),
            ),
          ]),
          const SizedBox(height: 4),
          Row(children: _buildScoreChips(c.id, candidates)),
        ],
      ),
    );
  }

  List<Widget> _buildScoreChips(String candidateId, List<Candidate> candidates) {
    return List.generate(6, (i) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 1),
        child: ChoiceChip(
          label: Text('$i'),
          selected: (_scores[candidateId] ?? 0) == i,
          onSelected: (_) {
            setState(() {
              _scores[candidateId] = i;
              _syncTieBreaks(candidates);
            });
          },
        ),
      );
    });
  }

  Widget _buildApprovalStepperCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: child,
    );
  }

  Widget _buildTopKStepper(int maxCount, String label) {
    return Row(
      children: [
        const Text('Approve top '),
        IconButton(
          icon: const Icon(Icons.remove),
          onPressed:
              _approvalTopK > 0 ? () => setState(() => _approvalTopK--) : null,
        ),
        Text('$_approvalTopK',
            style: Theme.of(context).textTheme.titleMedium),
        IconButton(
          icon: const Icon(Icons.add),
          onPressed: _approvalTopK < maxCount
              ? () => setState(() => _approvalTopK++)
              : null,
        ),
        Expanded(child: Text(' $label')),
      ],
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit(List<Candidate> candidates, String template) async {
    // Pre-submit gate: check for candidate changes in ad-hoc elections
    final preCheckElection =
        ref.read(electionProvider(widget.electionId)).valueOrNull;
    if (preCheckElection != null && preCheckElection.allowVoterCandidates) {
      final freshCandidates = await ref
          .read(candidateRepositoryProvider)
          .listForElection(widget.electionId);
      if (freshCandidates.length != candidates.length) {
        _mergeNewCandidates(freshCandidates, preCheckElection.algorithms);
        ref.invalidate(candidatesProvider(widget.electionId));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text(
                    'New candidates were added — please review your ballot before submitting')),
          );
          setState(() {});
        }
        return;
      }
    }

    setState(() => _loading = true);

    try {
      final payload = <String, dynamic>{};

      switch (template) {
        case 'A':
          payload['irv'] = _rankings;
        case 'B':
          payload['star'] = _scores;
        case 'C':
          payload['approval'] = _approvals.toList();
        case 'D':
          payload['irv'] = _rankings;
          payload['approval'] =
              _deriveApprovalsFromRanking(_rankings).toList();
        case 'E':
          payload['star'] = _scores;
          payload['approval'] =
              _deriveApprovalsFromScores(candidates).toList();
        case 'F':
          payload['star'] = _scores;
          payload['irv'] = _deriveRanking(candidates);
        case 'G':
          final ranking = _deriveRanking(candidates);
          payload['star'] = _scores;
          payload['irv'] = ranking;
          payload['approval'] =
              _deriveApprovalsFromRanking(ranking).toList();
      }

      await ref.read(ballotRepositoryProvider).upsertBallot(
            electionId: widget.electionId,
            payload: payload,
          );

      ref.invalidate(existingBallotProvider(widget.electionId));
      ref.invalidate(ballotCountProvider(widget.electionId));

      // Trigger real-time results computation if enabled,
      // but skip if the payload hasn't changed (edit with no modifications)
      final election =
          await ref.read(electionProvider(widget.electionId).future);
      if (election.realtimeResults) {
        final oldPayload = widget.initialBallot?.payload;
        final payloadChanged = oldPayload == null ||
            jsonEncode(payload) != jsonEncode(oldPayload);
        if (payloadChanged) {
          try {
            await ref
                .read(resultRepositoryProvider)
                .computeResults(widget.electionId, close: false);
            ref.invalidate(resultsProvider(widget.electionId));
          } catch (_) {
            // Non-fatal — results will catch up on next vote
          }
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.initialBallot != null
                ? 'Ballot updated!'
                : 'Ballot submitted!'),
          ),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

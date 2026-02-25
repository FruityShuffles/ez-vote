import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
        leading: const DashboardButton(),
        automaticallyImplyLeading: false,
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
            const Text('Drag to rank all candidates (1 = most preferred):'),
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
                  child: ListTile(
                    leading: CircleAvatar(child: Text('${index + 1}')),
                    title: Text(candidate?.name ?? 'Unknown'),
                    trailing: const Icon(Icons.drag_handle),
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
            const Text('Give each candidate a score from 0 to 5:'),
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
            Text('Select Approved Candidates',
                style: Theme.of(context).textTheme.titleMedium),
            const Text('Check all candidates you approve of:'),
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
            const Text(
                'Drag to rank candidates, then set how many you approve:'),
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
                  child: ListTile(
                    leading: CircleAvatar(child: Text('${index + 1}')),
                    title: Text(candidate?.name ?? 'Unknown'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (isApproved) _approvedBadge(),
                        const SizedBox(width: 8),
                        const Icon(Icons.drag_handle),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),
            _buildTopKStepper(candidates.length, 'candidates'),
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
            const Text('Rate each candidate 0–5. Set your approval threshold:'),
            const SizedBox(height: 8),
            ...candidates.map((c) => _buildStarCandidateRow(
                  c, candidates,
                  isApproved: approvedSet.contains(c.id))),
            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('Approval threshold: score ≥ '),
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
          ],
        ),
      ),
    );
  }

  // ── Template F: STAR + IRV ────────────────────────────────────────────────

  Widget _buildTemplateF(List<Candidate> candidates) {
    final ranking = _deriveRanking(candidates);
    final rankMap = {
      for (int i = 0; i < ranking.length; i++) ranking[i]: i + 1
    };
    final tiedGroups = _getUiTiedGroups(candidates);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Rate Candidates',
                style: Theme.of(context).textTheme.titleMedium),
            const Text(
                'Rate each candidate 0–5. IRV order is derived automatically:'),
            const SizedBox(height: 8),
            ...candidates.map((c) => _buildStarCandidateRow(
                  c, candidates,
                  irvRank: rankMap[c.id])),
            if (tiedGroups.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),
              Text('Resolve Ties',
                  style: Theme.of(context).textTheme.titleSmall),
              const Text(
                  'Drag to set preference within tied score groups:'),
              const SizedBox(height: 4),
              ...tiedGroups.entries.map(
                (entry) =>
                    _buildTieBreakGroup(entry.key, entry.value, candidates),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ── Template G: STAR + IRV + Approval ────────────────────────────────────

  Widget _buildTemplateG(List<Candidate> candidates) {
    final ranking = _deriveRanking(candidates);
    final rankMap = {
      for (int i = 0; i < ranking.length; i++) ranking[i]: i + 1
    };
    final tiedGroups = _getUiTiedGroups(candidates);
    final approvedSet = _deriveApprovalsFromRanking(ranking);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Rate Candidates',
                style: Theme.of(context).textTheme.titleMedium),
            const Text(
                'Rate each candidate 0–5. IRV order and approvals are derived automatically:'),
            const SizedBox(height: 8),
            ...candidates.map((c) => _buildStarCandidateRow(
                  c, candidates,
                  irvRank: rankMap[c.id],
                  isApproved: approvedSet.contains(c.id))),
            if (tiedGroups.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),
              Text('Resolve Ties',
                  style: Theme.of(context).textTheme.titleSmall),
              const Text(
                  'Drag to set preference within tied score groups:'),
              const SizedBox(height: 4),
              ...tiedGroups.entries.map(
                (entry) =>
                    _buildTieBreakGroup(entry.key, entry.value, candidates),
              ),
            ],
            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 8),
            _buildTopKStepper(
                candidates.length, 'candidates (by IRV order)'),
          ],
        ),
      ),
    );
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

  Widget _buildTieBreakGroup(
      int score, List<String> tiedIds, List<Candidate> allCandidates) {
    final candidateMap = {for (final c in allCandidates) c.id: c};
    // Use stored order if valid, otherwise fall back to default
    final stored = _tieBreaks[score];
    final order = (stored != null &&
            stored.toSet().containsAll(tiedIds.toSet()) &&
            tiedIds.toSet().containsAll(stored.toSet()))
        ? stored
        : tiedIds;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Text('Score $score (tied)',
              style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
        ReorderableListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: order.length,
          onReorder: (oldIndex, newIndex) {
            setState(() {
              if (newIndex > oldIndex) newIndex--;
              final newOrder = List<String>.from(order);
              final item = newOrder.removeAt(oldIndex);
              newOrder.insert(newIndex, item);
              _tieBreaks[score] = newOrder;
            });
          },
          itemBuilder: (context, index) {
            final id = order[index];
            final candidate = candidateMap[id];
            return ReorderableDragStartListener(
              key: ValueKey('tie_${score}_$id'),
              index: index,
              child: ListTile(
                leading: CircleAvatar(
                  radius: 12,
                  child: Text('${index + 1}',
                      style: const TextStyle(fontSize: 12)),
                ),
                title: Text(candidate?.name ?? 'Unknown'),
                trailing: const Icon(Icons.drag_handle),
              ),
            );
          },
        ),
      ],
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

      // Trigger real-time results computation if enabled
      final election =
          await ref.read(electionProvider(widget.electionId).future);
      if (election.realtimeResults) {
        try {
          await ref
              .read(resultRepositoryProvider)
              .computeResults(widget.electionId, close: false);
          ref.invalidate(resultsProvider(widget.electionId));
        } catch (_) {
          // Non-fatal — results will catch up on next vote
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../widgets/dashboard_button.dart';
import '../../domain/models/election.dart';

class CreateElectionScreen extends ConsumerStatefulWidget {
  final String? electionId;

  const CreateElectionScreen({super.key, this.electionId});

  @override
  ConsumerState<CreateElectionScreen> createState() =>
      _CreateElectionScreenState();
}

class _CreateElectionScreenState extends ConsumerState<CreateElectionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final List<TextEditingController> _candidateControllers = [
    TextEditingController(),
    TextEditingController(),
  ];
  final Set<VotingAlgorithm> _selectedAlgorithms = {VotingAlgorithm.approval};
  bool _allowVoterCandidates = false;
  bool _realtimeResults = false;
  bool _includeFptp = true;
  bool _publicBallots = false;
  bool _loading = false;
  bool _loadingInitial = false;

  bool get _isEditing => widget.electionId != null;

  @override
  void initState() {
    super.initState();
    if (_isEditing) {
      _loadInitialData();
    }
  }

  Future<void> _loadInitialData() async {
    setState(() => _loadingInitial = true);
    try {
      final electionRepo = ref.read(electionRepositoryProvider);
      final candidateRepo = ref.read(candidateRepositoryProvider);

      final election = await electionRepo.getById(widget.electionId!);
      final candidates =
          await candidateRepo.listForElection(widget.electionId!);

      _titleController.text = election.title;
      _descriptionController.text = election.description ?? '';

      _selectedAlgorithms.clear();
      for (final name in election.algorithms) {
        final algo = VotingAlgorithm.values.firstWhere(
          (a) => a.name == name,
          orElse: () => VotingAlgorithm.approval,
        );
        _selectedAlgorithms.add(algo);
      }
      _allowVoterCandidates = election.allowVoterCandidates;
      _realtimeResults = election.realtimeResults;
      _includeFptp = election.includeFptp;
      _publicBallots = election.publicBallots;

      // Dispose existing controllers and replace with one per candidate
      for (final c in _candidateControllers) {
        c.dispose();
      }
      _candidateControllers.clear();
      for (final candidate in candidates) {
        _candidateControllers.add(TextEditingController(text: candidate.name));
      }
      // Ensure at least 2 controllers
      while (_candidateControllers.length < 2) {
        _candidateControllers.add(TextEditingController());
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading election: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingInitial = false);
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    for (final c in _candidateControllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _addCandidate() {
    setState(() => _candidateControllers.add(TextEditingController()));
  }

  void _removeCandidate(int index) {
    if (_candidateControllers.length <= 2) return;
    setState(() {
      _candidateControllers[index].dispose();
      _candidateControllers.removeAt(index);
    });
  }

  Future<void> _save({bool open = false}) async {
    if (!_formKey.currentState!.validate()) return;

    final candidateNames = _candidateControllers
        .map((c) => c.text.trim())
        .where((n) => n.isNotEmpty)
        .toList();

    if (candidateNames.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('At least 2 candidates required')),
      );
      return;
    }

    final lowerNames = candidateNames.map((n) => n.toLowerCase()).toList();
    if (lowerNames.toSet().length != lowerNames.length) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Candidate names must be unique')),
      );
      return;
    }

    if (_selectedAlgorithms.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one algorithm')),
      );
      return;
    }

    setState(() => _loading = true);

    try {
      final electionRepo = ref.read(electionRepositoryProvider);
      final candidateRepo = ref.read(candidateRepositoryProvider);
      final algorithms = _selectedAlgorithms.map((a) => a.name).toList();
      final title = _titleController.text.trim();
      final description = _descriptionController.text.trim().isNotEmpty
          ? _descriptionController.text.trim()
          : null;

      if (_isEditing) {
        await electionRepo.update(
          widget.electionId!,
          title: title,
          description: description,
          algorithms: algorithms,
          allowVoterCandidates: _allowVoterCandidates,
          realtimeResults: _realtimeResults,
          includeFptp: _includeFptp,
          publicBallots: _publicBallots,
        );
        await candidateRepo.setCandidates(widget.electionId!, candidateNames);
        if (open) {
          await electionRepo.updateStatus(
              widget.electionId!, ElectionStatus.open);
        }
        ref.invalidate(electionProvider(widget.electionId!));
        ref.invalidate(candidatesProvider(widget.electionId!));
        ref.invalidate(ownedElectionsProvider);
        if (mounted) {
          context.go('/election/${widget.electionId}');
        }
      } else {
        final election = await electionRepo.create(
          title: title,
          description: description,
          algorithms: algorithms,
          allowVoterCandidates: _allowVoterCandidates,
          realtimeResults: _realtimeResults,
          includeFptp: _includeFptp,
          publicBallots: _publicBallots,
        );
        await candidateRepo.setCandidates(election.id, candidateNames);
        if (open) {
          await electionRepo.updateStatus(election.id, ElectionStatus.open);
        }
        ref.invalidate(ownedElectionsProvider);
        if (mounted) {
          context.go('/election/${election.id}');
        }
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

  bool get _hasAnyCandidate =>
      _candidateControllers.any((c) => c.text.trim().isNotEmpty);

  Future<void> _onPopInvoked(bool didPop) async {
    if (didPop) return;
    if (_isEditing) {
      if (mounted) context.go('/election/${widget.electionId}');
      return;
    }
    if (!_hasAnyCandidate) {
      if (mounted) context.pop();
      return;
    }
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard this election?'),
        content: const Text(
          'You have unsaved candidates. Save as a draft to keep your work, '
          'or discard to leave without saving.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop('cancel'),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop('discard'),
            child: const Text('Discard'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop('draft'),
            child: const Text('Save as Draft'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (result == 'discard') {
      context.pop();
    } else if (result == 'draft') {
      await _save();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) => _onPopInvoked(didPop),
      child: Scaffold(
        appBar: AppBar(
          leading: const DashboardButton(),
          title: Text(_isEditing ? 'Edit Election' : 'Create Election'),
        ),
        body: _loadingInitial
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 600),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextFormField(
                            controller: _titleController,
                            decoration: const InputDecoration(
                              labelText: 'Election Title',
                              border: OutlineInputBorder(),
                            ),
                            validator: (v) =>
                                v == null || v.trim().isEmpty
                                    ? 'Title required'
                                    : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _descriptionController,
                            decoration: const InputDecoration(
                              labelText: 'Description (optional)',
                              border: OutlineInputBorder(),
                            ),
                            maxLines: 3,
                          ),
                          const SizedBox(height: 24),
                          Text('Candidates',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          ..._candidateControllers.asMap().entries.map((entry) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: TextFormField(
                                      controller: entry.value,
                                      decoration: InputDecoration(
                                        labelText: 'Candidate ${entry.key + 1}',
                                        border: const OutlineInputBorder(),
                                      ),
                                    ),
                                  ),
                                  if (_candidateControllers.length > 2)
                                    IconButton(
                                      icon: const Icon(
                                          Icons.remove_circle_outline),
                                      onPressed: () =>
                                          _removeCandidate(entry.key),
                                    ),
                                ],
                              ),
                            );
                          }),
                          TextButton.icon(
                            onPressed: _addCandidate,
                            icon: const Icon(Icons.add),
                            label: const Text('Add Candidate'),
                          ),
                          const SizedBox(height: 24),
                          Text('Voting Algorithms',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          ...VotingAlgorithm.values.map((algo) {
                            final label = switch (algo) {
                              VotingAlgorithm.approval => 'Approval Voting',
                              VotingAlgorithm.irv =>
                                'Instant Runoff Voting (IRV)',
                              VotingAlgorithm.star => 'STAR Voting',
                            };
                            const descriptions = {
                              VotingAlgorithm.approval:
                                  'Vote for all candidates you find acceptable — the candidate with the most approvals wins.',
                              VotingAlgorithm.irv:
                                  'Rank candidates in order of preference; if no one has a majority, the last-place candidate is eliminated and those votes are redistributed until someone wins.',
                              VotingAlgorithm.star:
                                  'Score each candidate 0–5; the top two scorers advance to an automatic runoff, and whichever of those two is preferred by more voters wins.',
                            };
                            return CheckboxListTile(
                              title: Row(
                                children: [
                                  Text(label),
                                  const SizedBox(width: 4),
                                  IconButton(
                                    icon: const Icon(Icons.info_outline,
                                        size: 18),
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints(),
                                    tooltip: 'About $label',
                                    onPressed: () => showDialog<void>(
                                      context: context,
                                      builder: (_) => AlertDialog(
                                        title: Text(label),
                                        content: Text(descriptions[algo]!),
                                        actions: [
                                          TextButton(
                                            onPressed: () =>
                                                Navigator.of(context).pop(),
                                            child: const Text('Got it'),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              value: _selectedAlgorithms.contains(algo),
                              onChanged: (checked) {
                                setState(() {
                                  if (checked == true) {
                                    _selectedAlgorithms.add(algo);
                                  } else {
                                    _selectedAlgorithms.remove(algo);
                                  }
                                });
                              },
                            );
                          }),
                          const SizedBox(height: 24),
                          Text('Settings',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          SwitchListTile(
                            title: const Text('Allow voters to add candidates'),
                            subtitle: const Text(
                              'Participants can suggest new candidates while the election is open',
                            ),
                            value: _allowVoterCandidates,
                            onChanged: (v) {
                              setState(() {
                                _allowVoterCandidates = v;
                              });
                            },
                          ),
                          SwitchListTile(
                            title: const Text('Show real-time results'),
                            subtitle: const Text(
                              'Results update after each vote',
                            ),
                            value: _realtimeResults,
                            onChanged: (v) {
                              setState(() => _realtimeResults = v);
                            },
                          ),
                          SwitchListTile(
                            title: const Text('Include FPTP comparison'),
                            subtitle: const Text(
                              'Compare results to simple plurality (first-past-the-post) voting',
                            ),
                            value: _includeFptp,
                            onChanged: (v) {
                              setState(() => _includeFptp = v);
                            },
                          ),
                          SwitchListTile(
                            title: const Text('Public ballots'),
                            subtitle: const Text(
                              'Anyone in the election can see how each voter voted. Cannot be changed after the election opens.',
                            ),
                            value: _publicBallots,
                            onChanged: (v) {
                              setState(() => _publicBallots = v);
                            },
                          ),
                          const SizedBox(height: 24),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: _loading ? null : () => _save(),
                                  child: Text(_isEditing
                                      ? 'Save Changes'
                                      : 'Save as Draft'),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: FilledButton(
                                  onPressed: _loading
                                      ? null
                                      : () => _save(open: true),
                                  child: Text(_isEditing
                                      ? 'Save & Open'
                                      : 'Save & Open'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}

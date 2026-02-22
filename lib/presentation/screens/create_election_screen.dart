import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../../domain/models/election.dart';

class CreateElectionScreen extends ConsumerStatefulWidget {
  const CreateElectionScreen({super.key});

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
  bool _loading = false;

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
      final election = await ref.read(electionRepositoryProvider).create(
            title: _titleController.text.trim(),
            description: _descriptionController.text.trim().isNotEmpty
                ? _descriptionController.text.trim()
                : null,
            algorithms:
                _selectedAlgorithms.map((a) => a.name).toList(),
          );

      await ref
          .read(candidateRepositoryProvider)
          .setCandidates(election.id, candidateNames);

      if (open) {
        await ref
            .read(electionRepositoryProvider)
            .updateStatus(election.id, ElectionStatus.open);
      }

      ref.invalidate(ownedElectionsProvider);

      if (mounted) {
        context.go('/election/${election.id}');
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Election')),
      body: SingleChildScrollView(
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
                        v == null || v.trim().isEmpty ? 'Title required' : null,
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
                              icon: const Icon(Icons.remove_circle_outline),
                              onPressed: () => _removeCandidate(entry.key),
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
                      VotingAlgorithm.irv => 'Instant Runoff Voting (IRV)',
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
                            icon: const Icon(Icons.info_outline, size: 18),
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
                                    onPressed: () => Navigator.of(context).pop(),
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
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _loading ? null : () => _save(),
                          child: const Text('Save as Draft'),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: FilledButton(
                          onPressed:
                              _loading ? null : () => _save(open: true),
                          child: const Text('Save & Open'),
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
    );
  }
}

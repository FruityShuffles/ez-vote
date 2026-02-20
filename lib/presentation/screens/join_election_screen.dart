import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';

class JoinElectionScreen extends ConsumerStatefulWidget {
  final String electionId;

  const JoinElectionScreen({super.key, required this.electionId});

  @override
  ConsumerState<JoinElectionScreen> createState() => _JoinElectionScreenState();
}

class _JoinElectionScreenState extends ConsumerState<JoinElectionScreen> {
  @override
  void initState() {
    super.initState();
    _join();
  }

  Future<void> _join() async {
    try {
      await ref
          .read(electionRepositoryProvider)
          .joinElection(widget.electionId);
    } catch (_) {
      // Ignore errors (e.g. already a member) — fall through to election detail.
    }
    if (mounted) context.go('/election/${widget.electionId}');
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../../domain/models/election.dart';
import 'learn_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('EZVote'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () async {
              await ref.read(authRepositoryProvider).signOut();
              if (mounted) context.go('/login');
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'My Elections'),
            Tab(text: 'My Votes'),
            Tab(text: 'Learn'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _OwnedElectionsList(),
          _VotedElectionsList(),
          const LearnTab(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/create'),
        icon: const Icon(Icons.add),
        label: const Text('New Election'),
      ),
    );
  }
}

class _OwnedElectionsList extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final elections = ref.watch(ownedElectionsProvider);

    return elections.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (list) {
        if (list.isEmpty) {
          return const Center(child: Text('No elections yet. Create one!'));
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(ownedElectionsProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: list.length,
            itemBuilder: (context, i) => _ElectionCard(election: list[i]),
          ),
        );
      },
    );
  }
}

class _VotedElectionsList extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final elections = ref.watch(votedElectionsProvider);

    return elections.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (list) {
        if (list.isEmpty) {
          return const Center(
            child: Text('Elections you vote in will appear here.'),
          );
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(votedElectionsProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: list.length,
            itemBuilder: (context, i) => _ElectionCard(election: list[i]),
          ),
        );
      },
    );
  }
}

class _ElectionCard extends StatelessWidget {
  final Election election;

  const _ElectionCard({required this.election});

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (election.status) {
      ElectionStatus.draft => Colors.grey,
      ElectionStatus.open => Colors.green,
      ElectionStatus.closed => Colors.red,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        title: Text(election.title),
        subtitle: Text(election.description ?? ''),
        trailing: Chip(
          label: Text(election.status.name.toUpperCase()),
          backgroundColor: statusColor.withValues(alpha: 0.15),
          labelStyle: TextStyle(color: statusColor),
        ),
        onTap: () => context.push('/election/${election.id}'),
      ),
    );
  }
}

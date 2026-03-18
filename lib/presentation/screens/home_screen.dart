import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../../domain/models/election.dart';
import '../../domain/models/result.dart';
import 'learn_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  GoRouter? _router;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_onTabChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final router = GoRouter.of(context);
    if (_router != router) {
      _router?.routerDelegate.removeListener(_onRouteChanged);
      _router = router;
      router.routerDelegate.addListener(_onRouteChanged);
    }
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    switch (_tabController.index) {
      case 0:
        ref.invalidate(ownedElectionsProvider);
      case 1:
        ref.invalidate(votedElectionsProvider);
        ref.invalidate(pendingInvitationsProvider);
    }
  }

  void _onRouteChanged() {
    if (!mounted) return;
    final path =
        GoRouter.of(context).routeInformationProvider.value.uri.path;
    if (path == '/dashboard') {
      ref.invalidate(ownedElectionsProvider);
      ref.invalidate(votedElectionsProvider);
      ref.invalidate(pendingInvitationsProvider);
    }
  }

  @override
  void dispose() {
    _router?.routerDelegate.removeListener(_onRouteChanged);
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(
          onTap: () => context.go('/dashboard'),
          child: Row(
            children: [
              Image.asset('EZ Vote logo small.png', width: 28, height: 28),
              const SizedBox(width: 8),
              const Text('EZVote'),
            ],
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
            onPressed: () => context.push('/settings'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () async {
              final router = GoRouter.of(context);
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Sign out?'),
                  content: const Text('Are you sure you want to sign out?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(false),
                      child: const Text('Cancel'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(true),
                      child: const Text('Sign out'),
                    ),
                  ],
                ),
              );
              if (confirmed != true) return;
              await ref.read(authRepositoryProvider).signOut();
              if (mounted) router.go('/login');
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
            itemBuilder: (context, i) => _ElectionCard(
              election: list[i],
              onDelete: () async {
                await ref
                    .read(electionRepositoryProvider)
                    .deleteElection(list[i].id);
                ref.invalidate(ownedElectionsProvider);
              },
            ),
          ),
        );
      },
    );
  }
}

class _VotedElectionsList extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final votedAsync = ref.watch(votedElectionsProvider);
    final pendingAsync = ref.watch(pendingInvitationsProvider);

    final pending = pendingAsync.valueOrNull ?? [];
    final voted = votedAsync.valueOrNull ?? [];
    final isLoading =
        votedAsync.isLoading && pendingAsync.isLoading;

    if (isLoading) return const Center(child: CircularProgressIndicator());

    if (pending.isEmpty && voted.isEmpty) {
      return const Center(
        child: Text('Elections you vote in will appear here.'),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(votedElectionsProvider);
        ref.invalidate(pendingInvitationsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (pending.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('Pending Invitations',
                  style: Theme.of(context).textTheme.titleSmall),
            ),
            ...pending.map((e) => _ElectionCard(election: e)),
            const Divider(height: 32),
          ],
          if (voted.isNotEmpty) ...[
            if (pending.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text('Voted',
                    style: Theme.of(context).textTheme.titleSmall),
              ),
            ...voted.map((e) => _ElectionCard(election: e)),
          ],
        ],
      ),
    );
  }
}

String? _winnersLabel(List<ElectionResult> results) {
  final wins = <String, int>{};
  for (final r in results) {
    final data = r.resultData;
    final ws = (data['winners'] as List<dynamic>?)?.cast<String>() ??
        (data['winner'] != null ? [data['winner'] as String] : []);
    for (final name in ws) {
      wins[name] = (wins[name] ?? 0) + 1;
    }
  }
  if (wins.isEmpty) return null;
  final maxW = wins.values.reduce((a, b) => a > b ? a : b);
  final leaders =
      wins.entries.where((e) => e.value == maxW).map((e) => e.key).toList();
  return leaders.length == 1
      ? 'Winner: ${leaders.first}'
      : 'Tied: ${leaders.join(' & ')}';
}

class _ElectionCard extends ConsumerWidget {
  final Election election;
  final Future<void> Function()? onDelete;

  const _ElectionCard({required this.election, this.onDelete});

  Future<void> _confirmDelete(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete election?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(ctx).colorScheme.error,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await onDelete!();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusColor = switch (election.status) {
      ElectionStatus.draft => Colors.grey,
      ElectionStatus.open => Colors.green,
      ElectionStatus.closed => Colors.red,
    };

    final chip = Chip(
      label: Text(election.status.name.toUpperCase()),
      backgroundColor: statusColor.withValues(alpha: 0.15),
      labelStyle: TextStyle(color: statusColor),
    );

    final trailing = onDelete != null
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              chip,
              IconButton(
                icon: Icon(
                  Icons.delete_outline,
                  color: Theme.of(context).colorScheme.error,
                ),
                onPressed: () => _confirmDelete(context),
              ),
            ],
          )
        : chip;

    final countAsync = ref.watch(ballotCountProvider(election.id));
    final countLine = countAsync.whenOrNull(
      data: (n) => '$n ballot${n == 1 ? '' : 's'}',
    );

    final resultsAsync = election.status == ElectionStatus.closed
        ? ref.watch(resultsProvider(election.id))
        : null;
    final winnerLine = resultsAsync?.whenOrNull(
      data: (results) => _winnersLabel(results),
    );

    final subtitleParts = [
      if (election.description != null && election.description!.isNotEmpty)
        election.description!,
      ?countLine,
      ?winnerLine,
    ];

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        title: Text(election.title),
        subtitle: subtitleParts.isEmpty
            ? null
            : Text(subtitleParts.join(' · ')),
        trailing: trailing,
        onTap: () => election.status == ElectionStatus.draft
            ? context.push('/election/${election.id}/edit')
            : context.push('/election/${election.id}'),
      ),
    );
  }
}

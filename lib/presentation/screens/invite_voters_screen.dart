import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';

class InviteVotersScreen extends ConsumerStatefulWidget {
  final String electionId;

  const InviteVotersScreen({super.key, required this.electionId});

  @override
  ConsumerState<InviteVotersScreen> createState() => _InviteVotersScreenState();
}

class _InviteVotersScreenState extends ConsumerState<InviteVotersScreen> {
  final _emailController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _sendInvite() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;

    setState(() => _loading = true);

    try {
      final invite = await ref
          .read(inviteRepositoryProvider)
          .createInvite(widget.electionId, email);
      _emailController.clear();
      ref.invalidate(invitesProvider(widget.electionId));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Invite sent! Token: ${invite.token}'),
            action: SnackBarAction(
              label: 'Copy Token',
              onPressed: () {
                Clipboard.setData(ClipboardData(text: invite.token));
              },
            ),
            duration: const Duration(seconds: 10),
          ),
        );
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
    final invites = ref.watch(invitesProvider(widget.electionId));

    return Scaffold(
      appBar: AppBar(title: const Text('Invite Voters')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _emailController,
                        decoration: const InputDecoration(
                          labelText: 'Email address',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: TextInputType.emailAddress,
                      ),
                    ),
                    const SizedBox(width: 12),
                    FilledButton(
                      onPressed: _loading ? null : _sendInvite,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Invite'),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text('Sent Invites',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                invites.when(
                  loading: () => const CircularProgressIndicator(),
                  error: (e, _) => Text('Error: $e'),
                  data: (list) {
                    if (list.isEmpty) {
                      return const Text('No invites sent yet.');
                    }
                    return Column(
                      children: list
                          .map((invite) => Card(
                                child: ListTile(
                                  title: Text(invite.email),
                                  subtitle: Text(
                                    invite.isAccepted
                                        ? 'Accepted'
                                        : 'Pending',
                                  ),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      if (!invite.isAccepted)
                                        IconButton(
                                          icon: const Icon(Icons.copy),
                                          tooltip: 'Copy token',
                                          onPressed: () {
                                            Clipboard.setData(ClipboardData(
                                                text: invite.token));
                                            ScaffoldMessenger.of(context)
                                                .showSnackBar(
                                              const SnackBar(
                                                  content: Text(
                                                      'Token copied!')),
                                            );
                                          },
                                        ),
                                      Icon(
                                        invite.isAccepted
                                            ? Icons.check_circle
                                            : Icons.pending,
                                        color: invite.isAccepted
                                            ? Colors.green
                                            : Colors.orange,
                                      ),
                                    ],
                                  ),
                                ),
                              ))
                          .toList(),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

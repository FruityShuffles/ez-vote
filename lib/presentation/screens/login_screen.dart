import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  final String? redirect;

  const LoginScreen({super.key, this.redirect});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).signInWithGoogle(
            redirectTo: '${Uri.base.origin}/dashboard',
          );
      // Auth state change handled by authStateProvider → router redirect
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(authRepositoryProvider).signIn(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          );
      if (mounted) {
        context.go(widget.redirect != null
            ? Uri.decodeComponent(widget.redirect!)
            : '/dashboard');
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset('EZ Vote logo.png', width: 64, height: 64),
                    const SizedBox(height: 12),
                    Text(
                      'EZVote',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sign in to continue',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),
                    AutofillGroup(
                      child: Column(
                        children: [
                          TextFormField(
                            controller: _emailController,
                            decoration: const InputDecoration(
                              labelText: 'Email',
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.emailAddress,
                            autofillHints: const [AutofillHints.email],
                            validator: (v) =>
                                v == null || v.isEmpty ? 'Email required' : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            decoration: const InputDecoration(
                              labelText: 'Password',
                              border: OutlineInputBorder(),
                            ),
                            obscureText: true,
                            autofillHints: const [AutofillHints.password],
                            validator: (v) =>
                                v == null || v.isEmpty ? 'Password required' : null,
                          ),
                        ],
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _loading ? null : _signIn,
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Sign In'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Expanded(child: Divider()),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text(
                            'or',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                        const Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _loading ? null : _signInWithGoogle,
                        icon: const Text('G',
                            style: TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 16)),
                        label: const Text('Continue with Google'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => context.go(widget.redirect != null
                          ? '/signup?redirect=${widget.redirect}'
                          : '/signup'),
                      child: const Text("Don't have an account? Sign up"),
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';

class SignupScreen extends ConsumerStatefulWidget {
  final String? redirect;

  const SignupScreen({super.key, this.redirect});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _displayNameController = TextEditingController();
  final _otpController = TextEditingController();
  bool _loading = false;
  bool _emailSent = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _displayNameController.dispose();
    _otpController.dispose();
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

  Future<void> _signUp() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(authRepositoryProvider).signUp(
            email: _emailController.text.trim(),
            password: _passwordController.text,
            displayName: _displayNameController.text.trim().isNotEmpty
                ? _displayNameController.text.trim()
                : null,
          );
      if (mounted) {
        setState(() {
          _emailSent = true;
          _error = null;
        });
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).verifyOtp(
            email: _emailController.text.trim(),
            token: _otpController.text.trim(),
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
    if (_emailSent) {
      return Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Card(
              margin: const EdgeInsets.all(24),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.mark_email_unread_outlined, size: 48),
                    const SizedBox(height: 16),
                    Text(
                      'Check your email',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Enter the 8-digit code we sent to ${_emailController.text.trim()}.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _otpController,
                      decoration: const InputDecoration(
                        labelText: 'Confirmation code',
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: TextInputType.number,
                      maxLength: 8,
                      textAlign: TextAlign.center,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _loading ? null : _verifyOtp,
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2),
                              )
                            : const Text('Confirm'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => context.go('/login'),
                      child: const Text('Back to sign in'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

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
                      'Create Account',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _displayNameController,
                      decoration: const InputDecoration(
                        labelText: 'Display Name (optional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _emailController,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        border: OutlineInputBorder(),
                      ),
                      keyboardType: TextInputType.emailAddress,
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
                      validator: (v) => v == null || v.length < 6
                          ? 'Min 6 characters'
                          : null,
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
                        onPressed: _loading ? null : _signUp,
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Sign Up'),
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
                          ? '/login?redirect=${widget.redirect}'
                          : '/login'),
                      child: const Text('Already have an account? Sign in'),
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

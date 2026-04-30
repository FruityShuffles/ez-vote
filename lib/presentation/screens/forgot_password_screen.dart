import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../providers/providers.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  final String? redirect;

  const ForgotPasswordScreen({super.key, this.redirect});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailFormKey = GlobalKey<FormState>();
  final _resetFormKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  bool _codeSent = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _otpController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String _friendlyAuthError(Object e) {
    if (e is AuthException) {
      final code = e.code ?? '';
      if (code == 'over_email_send_rate_limit') {
        return 'Too many requests. Please wait a minute and try again.';
      }
      if (code == 'otp_expired' ||
          code == 'invalid_otp' ||
          code == 'token_not_found') {
        return 'That code is invalid or expired. Request a new one.';
      }
      if (code == 'same_password') {
        return 'New password must be different from the old one.';
      }
      if (code == 'weak_password') {
        return 'Password is too weak. Use at least 6 characters.';
      }
      return e.message;
    }
    return e.toString();
  }

  Future<void> _sendCode() async {
    if (!_emailFormKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref
          .read(authRepositoryProvider)
          .sendPasswordResetEmail(_emailController.text.trim());
      if (mounted) {
        setState(() {
          _codeSent = true;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = _friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resetPassword() async {
    if (!_resetFormKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final repo = ref.read(authRepositoryProvider);
      await repo.verifyOtp(
        email: _emailController.text.trim(),
        token: _otpController.text.trim(),
        type: OtpType.recovery,
      );
      await repo.updatePassword(_passwordController.text);
      if (mounted) {
        final dest = widget.redirect != null
            ? Uri.decodeComponent(widget.redirect!)
            : '/dashboard';
        context.go(dest.startsWith('/') ? dest : '/dashboard');
      }
    } catch (e) {
      if (mounted) setState(() => _error = _friendlyAuthError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _backToLoginPath() => widget.redirect != null
      ? '/login?redirect=${Uri.encodeComponent(widget.redirect!)}'
      : '/login';

  @override
  Widget build(BuildContext context) {
    if (_codeSent) {
      return Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Card(
              margin: const EdgeInsets.all(24),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _resetFormKey,
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
                        'Enter the 8-digit code we sent to ${_emailController.text.trim()} and choose a new password.',
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
                        validator: (v) =>
                            v == null || v.isEmpty ? 'Code required' : null,
                      ),
                      const SizedBox(height: 8),
                      AutofillGroup(
                        child: TextFormField(
                          controller: _passwordController,
                          decoration: const InputDecoration(
                            labelText: 'New password',
                            border: OutlineInputBorder(),
                          ),
                          obscureText: true,
                          autofillHints: const [AutofillHints.newPassword],
                          validator: (v) => v == null || v.length < 6
                              ? 'Min 6 characters'
                              : null,
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error)),
                      ],
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _loading ? null : _resetPassword,
                          child: _loading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2),
                                )
                              : const Text('Reset password'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => context.go(_backToLoginPath()),
                        child: const Text('Back to sign in'),
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

    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _emailFormKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset('EZ Vote logo small.png', width: 64, height: 64),
                    const SizedBox(height: 12),
                    Text(
                      'Reset Password',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Enter your email and we'll send you a recovery code.",
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),
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
                        onPressed: _loading ? null : _sendCode,
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Send recovery code'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => context.go(_backToLoginPath()),
                      child: const Text('Back to sign in'),
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

import 'package:flutter/material.dart';

class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy Policy')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            _Section(
              title: 'Last updated: February 2026',
              body:
                  'This Privacy Policy describes how EZVote ("we", "us", or "our") '
                  'collects, uses, and shares information about you when you use our service.',
            ),
            _Section(
              title: 'Information We Collect',
              body:
                  'When you create an account, we collect your email address and, '
                  'optionally, a display name you provide. When you create or participate '
                  'in elections, we store the election data (title, description, candidates) '
                  'and your ballot responses, linked to your account.',
            ),
            _Section(
              title: 'Third-Party Services',
              body:
                  'We use the following third-party services:\n\n'
                  '• Supabase — our database and authentication provider. '
                  'Your data is stored on Supabase infrastructure.\n\n'
                  '• Google OAuth — if you choose to sign in with Google, Google '
                  'shares your email address and profile information with us under '
                  'Google\'s Privacy Policy.\n\n'
                  '• Cloudflare Pages — hosts the EZVote web application. '
                  'Cloudflare may log standard web request metadata (IP address, '
                  'user-agent) as part of its network operations. We do not use '
                  'Cloudflare analytics or any other intentional analytics service.',
            ),
            _Section(
              title: 'How We Use Your Information',
              body:
                  'We use your information solely to provide the EZVote service: '
                  'authenticating you, displaying your elections and votes, and computing '
                  'election results. We do not sell your data or use it for advertising.',
            ),
            _Section(
              title: 'Data Retention',
              body:
                  'When you delete your account:\n\n'
                  '• Your profile and all elections you own (including candidates, '
                  'invites, and results) are permanently deleted.\n\n'
                  '• Ballots you cast in elections that are still open or in draft '
                  'are permanently deleted.\n\n'
                  '• Ballots you cast in elections that have already closed are '
                  'anonymized — your voter ID is removed, but the ballot data is '
                  'retained so election results remain accurate.\n\n'
                  'Elections and all associated data are automatically deleted 60 days after they are created.',
            ),
            _Section(
              title: 'Your Rights',
              body:
                  'You may delete your account at any time from the Settings screen. '
                  'If you have questions or requests regarding your personal data, '
                  'contact us at contact@ez-vote.org.',
            ),
            _Section(
              title: 'Governing Law',
              body:
                  'This Privacy Policy is governed by the laws of the State of Wisconsin, USA.',
            ),
            _Section(
              title: 'Contact',
              body: 'contact@ez-vote.org',
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String body;

  const _Section({required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(body, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

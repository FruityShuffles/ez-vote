import 'package:flutter/material.dart';

class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Terms of Service')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            _Section(
              title: 'Last updated: February 2026',
              body:
                  'By using EZVote you agree to these Terms of Service. '
                  'If you do not agree, do not use the service.',
            ),
            _Section(
              title: 'Use of the Service',
              body:
                  'EZVote is provided for personal, non-commercial use only. '
                  'You may not resell, sublicense, or redistribute the service or '
                  'any data obtained through it.',
            ),
            _Section(
              title: 'Your Content',
              body:
                  'You are solely responsible for the elections you create and the '
                  'content you submit (titles, descriptions, candidate names). You '
                  'agree not to use EZVote for any unlawful purpose or to collect '
                  'votes on behalf of others without their knowledge.',
            ),
            _Section(
              title: 'Disclaimer of Warranties',
              body:
                  'EZVote is provided "as is" and "as available" without any warranty '
                  'of any kind, express or implied, including but not limited to '
                  'warranties of merchantability, fitness for a particular purpose, '
                  'or non-infringement. We do not guarantee that the service will be '
                  'error-free, secure, or continuously available.',
            ),
            _Section(
              title: 'Limitation of Liability',
              body:
                  'To the maximum extent permitted by applicable law, we shall not '
                  'be liable for any indirect, incidental, special, consequential, or '
                  'punitive damages arising out of or related to your use of EZVote, '
                  'even if advised of the possibility of such damages.',
            ),
            _Section(
              title: 'Changes to These Terms',
              body:
                  'We may update these Terms at any time. Continued use of EZVote '
                  'after changes are posted constitutes your acceptance of the updated Terms.',
            ),
            _Section(
              title: 'Governing Law',
              body:
                  'These Terms are governed by the laws of the State of Wisconsin, USA. '
                  'Any disputes shall be resolved in the courts of Wisconsin.',
            ),
            _Section(
              title: 'Contact',
              body: 'Questions? Contact us at contact@ez-vote.org.',
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

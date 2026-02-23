import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class DashboardButton extends StatelessWidget {
  const DashboardButton({super.key});

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: () => context.go('/dashboard'),
      icon: Image.asset('EZ Vote logo small.png', width: 20, height: 20),
      label: const Text('EZVote'),
      style: TextButton.styleFrom(
        foregroundColor: Theme.of(context).colorScheme.onSurface,
      ),
    );
  }
}

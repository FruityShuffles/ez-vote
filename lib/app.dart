import 'package:flutter/material.dart';
import 'config/router.dart';

class EZVoteApp extends StatefulWidget {
  const EZVoteApp({super.key});

  @override
  State<EZVoteApp> createState() => _EZVoteAppState();
}

class _EZVoteAppState extends State<EZVoteApp> {
  late final _router = createRouter();

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'EZVote',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.indigo,
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      routerConfig: _router,
    );
  }
}

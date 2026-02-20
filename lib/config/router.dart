import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../presentation/screens/login_screen.dart';
import '../presentation/screens/signup_screen.dart';
import '../presentation/screens/home_screen.dart';
import '../presentation/screens/create_election_screen.dart';
import '../presentation/screens/election_detail_screen.dart';
import '../presentation/screens/invite_voters_screen.dart';
import '../presentation/screens/ballot_screen.dart';
import '../presentation/screens/join_election_screen.dart';

final routerKey = GlobalKey<NavigatorState>();

GoRouter createRouter() {
  return GoRouter(
    navigatorKey: routerKey,
    initialLocation: '/',
    redirect: (context, state) {
      final session = Supabase.instance.client.auth.currentSession;
      final isLoggedIn = session != null;
      final loc = state.matchedLocation;
      final isAuthRoute = loc == '/login' || loc == '/signup';
      debugPrint('[router] redirect: loc=$loc uri=${state.uri} loggedIn=$isLoggedIn');

      String? result;
      if (!isLoggedIn && !isAuthRoute) {
        final redirectTo = Uri.encodeComponent(state.uri.toString());
        result = '/login?redirect=$redirectTo';
      } else if (isLoggedIn && isAuthRoute) {
        // Honour the redirect parameter so deep links survive the auth flow.
        final redirect = state.uri.queryParameters['redirect'];
        if (redirect != null && redirect.isNotEmpty) {
          result = Uri.decodeComponent(redirect);
        } else {
          result = '/';
        }
      }
      debugPrint('[router] → result: $result');
      return result;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginScreen(
          redirect: state.uri.queryParameters['redirect'],
        ),
      ),
      GoRoute(
        path: '/signup',
        builder: (context, state) => SignupScreen(
          redirect: state.uri.queryParameters['redirect'],
        ),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/create',
        builder: (context, state) => const CreateElectionScreen(),
      ),
      GoRoute(
        path: '/election/:id',
        builder: (context, state) => ElectionDetailScreen(
          electionId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/election/:id/join',
        builder: (context, state) => JoinElectionScreen(
          electionId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/election/:id/invite',
        builder: (context, state) => InviteVotersScreen(
          electionId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/election/:id/vote',
        builder: (context, state) => BallotScreen(
          electionId: state.pathParameters['id']!,
        ),
      ),
    ],
  );
}

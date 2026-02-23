import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../presentation/screens/landing_screen.dart';
import '../presentation/screens/login_screen.dart';
import '../presentation/screens/signup_screen.dart';
import '../presentation/screens/home_screen.dart';
import '../presentation/screens/create_election_screen.dart';
import '../presentation/screens/election_detail_screen.dart';
import '../presentation/screens/invite_voters_screen.dart';
import '../presentation/screens/ballot_screen.dart';
import '../presentation/screens/join_election_screen.dart';
import '../presentation/screens/settings_screen.dart';
import '../presentation/screens/privacy_policy_screen.dart';
import '../presentation/screens/terms_screen.dart';
import '../presentation/screens/learn_screen.dart';
import '../domain/models/ballot.dart';

final routerKey = GlobalKey<NavigatorState>();

GoRouter createRouter() {
  return GoRouter(
    navigatorKey: routerKey,
    initialLocation: '/',
    errorBuilder: (context, state) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final isLoggedIn =
            Supabase.instance.client.auth.currentSession != null;
        context.go(isLoggedIn ? '/dashboard' : '/');
      });
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    },
    redirect: (context, state) {
      final session = Supabase.instance.client.auth.currentSession;
      final isLoggedIn = session != null;
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/signup';
      final isPublicRoute = isAuthRoute ||
          state.matchedLocation == '/' ||
          state.matchedLocation == '/privacy' ||
          state.matchedLocation == '/tos' ||
          state.matchedLocation == '/learn';

      if (!isLoggedIn && !isPublicRoute) {
        final redirectTo = Uri.encodeComponent(state.uri.toString());
        return '/login?redirect=$redirectTo';
      }
      if (isLoggedIn && isAuthRoute) {
        // Honour the redirect parameter so deep links survive the auth flow.
        final redirect = state.uri.queryParameters['redirect'];
        if (redirect != null && redirect.isNotEmpty) {
          return Uri.decodeComponent(redirect);
        }
        return '/dashboard';
      }
      return null;
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
        builder: (context, state) => const LandingScreen(),
      ),
      GoRoute(
        path: '/dashboard',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/learn',
        builder: (context, state) => const LearnScreen(),
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
        path: '/election/:id/edit',
        builder: (context, state) => CreateElectionScreen(
          electionId: state.pathParameters['id'],
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
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          return BallotScreen(
            electionId: state.pathParameters['id']!,
            initialBallot: extra?['ballot'] as Ballot?,
            viewOnly: extra?['viewOnly'] as bool? ?? false,
          );
        },
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/privacy',
        builder: (context, state) => const PrivacyPolicyScreen(),
      ),
      GoRoute(
        path: '/tos',
        builder: (context, state) => const TermsScreen(),
      ),
    ],
  );
}

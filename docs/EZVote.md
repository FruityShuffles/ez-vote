# EZVote Documentation

Multi-algorithm voting application. React (web) + Supabase backend.

## Architecture

- [[Architecture/Overview]] — Data flow, providers, routing, screens
- [[Architecture/Ballot Templates]] — The 7 templates: triggers, UI, derivation rules
- [[Architecture/Ballot State Machine]] — Internal state, tie-breaks, merging, submit flow
- [[Architecture/Auth Flow]] — Signup OTP, OAuth, redirect threading, DB triggers

## Backend

- [[Backend/Schema]] — Tables, columns, constraints, migration history
- [[Backend/RLS Policies]] — What each policy protects and why
- [[Backend/RPC Functions]] — Each function: signature, caller, purpose
- [[Backend/Edge Function]] — compute-results: flow, all 4 algorithm implementations
- [[Backend/Simulate Counterfactual]] — simulate-counterfactual: "what if" re-tabulation, why it holds no service-role key

## Features

- [[Features/Invite Voters]] — Join link, QR code, add from prior elections
- [[Features/Ad-Hoc Candidates]] — allowVoterCandidates: polling, merging, pre-submit gate
- [[Features/Realtime Results]] — realtimeResults flag, polling, non-blocking compute calls
- [[Features/Election Analysis]] — Cross-method insight generation, patterns detected
- [[Features/FPTP]] — includeFptp flag, per-template behavior, auto-selection
- [[Features/Public Ballots]] — publicBallots flag, RLS, RPC, ballot paging UI
- [[Features/Counterfactual Explorer]] — M21 "what-ifs": the diff design language, the consequence rail, the edit ledger

## Decisions

- [[Decisions/Algorithm Design]] — Why these algorithms, tie handling philosophy, cleanup policy
- [[Decisions/Client-Side Derivation]] — Why derivation runs client-side, not server-side

## Migration (completed)

The Flutter → React migration finished with the M22 decommission; Flutter is archived at the `flutter-final` git tag. These docs are kept as the historical record of why the app is shaped the way it is — [[Migration/Tech Stack]] and [[Migration/Design System]] remain live references for the current stack.

- [[Migration/Tech Stack]] — framework/data/styling/component decisions for the React build (Vite SPA, TanStack Query + Zustand, Tailwind, Radix + shadcn) with rationale and alternatives
- [[Migration/Design System]] — design tokens (the indigo M3 palette mapped to shadcn/Base UI roles), the shared component inventory, and the a11y posture
- [[Migration/Overview]] — the migration plan: rationale, phased approach, and how each phase closed out
- [[Migration/Parity Checklist]] — behaviors carried across the rewrite, sourced from closed bugs and design decisions; now a behavior catalog rather than an open test plan
- [[Migration/Cutover Plan]] — verification record, the production cutover, and the release topology (Appendix A is the live operator runbook)

# EZVote Documentation

Multi-algorithm voting application. Flutter (web) + Supabase backend.

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

## Features

- [[Features/Ad-Hoc Candidates]] — allowVoterCandidates: polling, merging, pre-submit gate
- [[Features/Realtime Results]] — realtimeResults flag, polling, non-blocking compute calls
- [[Features/Election Analysis]] — Cross-method insight generation, patterns detected
- [[Features/FPTP]] — includeFptp flag, per-template behavior, auto-selection

## Decisions

- [[Decisions/Algorithm Design]] — Why these algorithms, tie handling philosophy, cleanup policy
- [[Decisions/Client-Side Derivation]] — Why derivation runs client-side, not server-side

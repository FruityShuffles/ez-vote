# Database Schema

Supabase (PostgreSQL). Migrations in `supabase/migrations/` — deploy with `supabase db push`.

## Core Tables

### `profiles`
Mirror of `auth.users` for app-level user data. Created by trigger on auth confirmation.

| Column | Type | Notes |
|---|---|---|
| id | uuid | FK → auth.users.id, PK |
| email | text | Not null |
| display_name | text | Nullable |
| created_at | timestamptz | Default now() |

### `elections`
Central entity. One row per election.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| owner_id | uuid | FK → profiles.id |
| title | text | Not null |
| description | text | Nullable |
| status | text | `'open'` or `'closed'` |
| algorithms | text[] | e.g. `['irv', 'star', 'approval']` |
| invite_mode | text | `'open'` (default); future: `'invite_only'` |
| allow_voter_candidates | boolean | Default false |
| realtime_results | boolean | Default false |
| include_fptp | boolean | Default false |
| candidates_updated_at | timestamptz | Bumped by trigger on candidate insert |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `candidates`
Ordered list of candidates per election.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| name | text | Not null |
| position | int | Sort order |
| created_at | timestamptz | |

**Constraint:** `idx_candidates_unique_name_per_election` — unique (election_id, name). Prevents duplicate candidate names within an election.

**Trigger:** On candidate insert, bumps `elections.candidates_updated_at`. Used for polling-based staleness detection.

### `ballots`
One row per (voter, election) pair. Stores full voting payload.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| voter_id | uuid | FK → profiles.id; nullable (nullified on account delete) |
| payload | jsonb | Full ballot data (see payload structure below) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Constraint:** unique(election_id, voter_id). One ballot per voter per election. Resubmission is an upsert.

### `results`
Computed voting results. One row per (election, algorithm) pair.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| algorithm | text | `'irv'`, `'star'`, `'approval'`, `'fptp'` |
| result_data | jsonb | Algorithm-specific result object |
| created_at | timestamptz | |
| updated_at | timestamptz | Used for realtime polling freshness |

**Constraint:** unique(election_id, algorithm). Edge function upserts.

### `invites`
Email invite records. Currently used for the future invite-only flow.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| election_id | uuid | FK → elections.id |
| email | text | Invitee email |
| token | uuid | Unique per invite; used in accept URL |
| accepted_by | uuid | FK → profiles.id; set on acceptance |
| accepted_at | timestamptz | |
| created_at | timestamptz | |

### `election_voters`
Tracks who has joined an open election. Populated via `join_election()` RPC.

| Column | Type | Notes |
|---|---|---|
| election_id | uuid | FK → elections.id |
| voter_id | uuid | FK → profiles.id |
| joined_at | timestamptz | |

**Constraint:** unique(election_id, voter_id). Join is idempotent.

## Ballot Payload Structure

Stored in `ballots.payload` (JSONB). Keys present depend on which algorithms the election uses:

```json
{
  "star": { "candidate-uuid-1": 5, "candidate-uuid-2": 3 },
  "irv": ["candidate-uuid-1", "candidate-uuid-3", "candidate-uuid-2"],
  "approval": ["candidate-uuid-1", "candidate-uuid-3"],
  "fptp": "candidate-uuid-1"
}
```

Derived fields (IRV from STAR scores, approval from cutoff/top-K) are computed client-side before submission. The edge function receives the final derived values — it does not re-derive anything.

## Migration History

| Migration | Key changes                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------- |
| 001       | Initial schema: profiles, elections, candidates, invites, ballots, results                      |
| 002       | RLS policies                                                                                    |
| 003       | RPC functions: accept_invite, get_ballot_count, etc.                                            |
| 004       | Unique constraint on candidate names per election                                               |
| 005       | `invite_mode` column, `election_voters` table, `join_election()` RPC                            |
| 006       | `current_user_owns_election()` security-definer fn (breaks RLS recursion)                       |
| 007       | `on_auth_user_confirmed` trigger — fires on UPDATE when `email_confirmed_at` goes null→non-null (email/OTP flow) → calls `handle_new_user()` to upsert profile |
| 008–012   | Incremental feature additions                                                                   |
| 009       | Adds `on_auth_user_created` trigger — fires on INSERT when `email_confirmed_at IS NOT NULL` (Google OAuth, pre-confirmed). Both 007 and 009 call `handle_new_user()`. The `ON CONFLICT (id) DO NOTHING` in that function is load-bearing — do not remove it. |
| 013       | `allow_voter_candidates`, `realtime_results`, `candidates_updated_at`; candidate insert trigger |
| 014       | `updated_at` on results table (for realtime polling freshness)                                  |
| 015–016   | Additional RPC functions (prior covoters, pending invitees)                                     |
| 017       | `include_fptp` flag on elections                                                                |
| 018       | pg_cron job: delete elections older than 60 days at 3 AM daily                                  |

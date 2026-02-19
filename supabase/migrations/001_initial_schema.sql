-- Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- Elections table
create table if not exists public.elections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  algorithms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Candidates table
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Invites table
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  email text not null,
  token text not null unique,
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ballots table
create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(election_id, voter_id)
);

-- Results table
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  algorithm text not null,
  result_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(election_id, algorithm)
);

-- Indexes
create index if not exists idx_elections_owner on public.elections(owner_id);
create index if not exists idx_candidates_election on public.candidates(election_id);
create index if not exists idx_invites_election on public.invites(election_id);
create index if not exists idx_invites_token on public.invites(token);
create index if not exists idx_ballots_election on public.ballots(election_id);
create index if not exists idx_ballots_voter on public.ballots(voter_id);
create index if not exists idx_results_election on public.results(election_id);

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.elections enable row level security;
alter table public.candidates enable row level security;
alter table public.invites enable row level security;
alter table public.ballots enable row level security;
alter table public.results enable row level security;

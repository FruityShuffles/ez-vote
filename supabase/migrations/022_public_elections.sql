-- Publicly viewable elections (issue #140, first slice of the Case Studies
-- tracker #139).
--
-- `visibility = 'public'` makes an election readable by anyone, including
-- sessionless visitors on the `anon` role — the election row, its candidates,
-- its results, and (because public elections opt into public ballots) its
-- ballots via get_public_ballots(). `showcase` marks the curated Case Studies
-- subset; it is kept separate from `visibility` so future user-shared public
-- elections don't automatically appear in Case Studies.
--
-- No user-facing path sets either flag: the owner INSERT/UPDATE policies now
-- require `visibility = 'private' and showcase = false`, so only the
-- service-role seed script (next slice) can create or manage public elections.

alter table public.elections
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  add column showcase boolean not null default false;

-- Security-definer helper so policies on other tables can check an election's
-- visibility without recursing into the elections policies themselves (same
-- pattern as election_has_public_ballots in migration 020).
create or replace function public.election_is_public(p_election_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select visibility = 'public' from public.elections where id = p_election_id;
$$;

-- Public read access. No `to` clause, so these cover both `anon` and
-- `authenticated`; the tables' legacy grants already give both roles SELECT
-- at the grant layer, so RLS is the only gate.
create policy "Anyone can read public elections"
  on public.elections for select
  using (visibility = 'public');

create policy "Anyone can read public election candidates"
  on public.candidates for select
  using (public.election_is_public(election_id));

create policy "Anyone can read public election results"
  on public.results for select
  using (public.election_is_public(election_id));

-- Lock the new columns down. The UPDATE policy previously had no WITH CHECK
-- at all; requiring private/non-showcase on every owner write means no API
-- path can set the flags — and, deliberately, that owners cannot modify a
-- public election at all (only the service role, which bypasses RLS, manages
-- those).
alter policy "Owners can insert elections"
  on public.elections
  with check (
    owner_id = auth.uid()
    and visibility = 'private'
    and showcase = false
  );

alter policy "Owners can update own elections"
  on public.elections
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and visibility = 'private'
    and showcase = false
  );

-- get_public_ballots: skip the participant check when the election is public,
-- so anonymous callers can read (and simulate) public elections' ballots.
-- Every caller still needs `public_ballots = true` — you cannot simulate
-- ballots you cannot read.
--
-- Also fixes a NULL hazard in the 021 version: its gate was
-- `auth.uid() <> v_owner AND NOT EXISTS (...)`, which for an anonymous caller
-- (auth.uid() is NULL) evaluates to NULL — not true — so the exception was
-- never raised and anon callers could read ballots of ANY public_ballots
-- election. The private-election gate below rejects NULL explicitly.
create or replace function public.get_public_ballots(p_election_id uuid)
returns table(
  voter_id uuid,
  display_name text,
  payload jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_public boolean;
  v_owner uuid;
  v_visibility text;
begin
  select e.public_ballots, e.owner_id, e.visibility
    into v_public, v_owner, v_visibility
    from public.elections e
   where e.id = p_election_id;

  if v_owner is null then
    raise exception 'Election not found';
  end if;

  if not v_public then
    raise exception 'Public ballots not enabled';
  end if;

  if v_visibility <> 'public' then
    if auth.uid() is null
       or (auth.uid() <> v_owner and not exists (
             select 1
               from public.election_voters
              where election_id = p_election_id
                and user_id = auth.uid()
           ))
    then
      raise exception 'Not a participant';
    end if;
  end if;

  return query
    select b.voter_id, p.display_name, b.payload, b.updated_at
      from public.ballots b
      left join public.profiles p on p.id = b.voter_id
     where b.election_id = p_election_id
     order by p.display_name nulls last, b.created_at;
end;
$$;

-- Audit fix: the 018 version of get_pending_invitees had no access check (and
-- no search_path pin), so any caller — including anon — could list pending
-- invitees' display names for any election id. Gate it with the same
-- NULL-safe owner-or-joined-voter check as get_election_voters (015).
create or replace function public.get_pending_invitees(p_election_id uuid)
returns table (display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    exists (
      select 1 from public.elections
      where id = p_election_id and owner_id = auth.uid()
    )
    or exists (
      select 1 from public.election_voters
      where election_id = p_election_id and user_id = auth.uid()
    )
  ) then
    raise exception 'Not a participant';
  end if;

  return query
    select p.display_name
    from public.election_voters ev
    join public.profiles p on p.id = ev.user_id
    where ev.election_id = p_election_id
      and not exists (
        select 1 from public.ballots b
        where b.election_id = p_election_id
          and b.voter_id = ev.user_id
      )
    order by p.display_name;
end;
$$;

-- Retention: public elections are never auto-deleted. cron.schedule with an
-- existing job name replaces the job in place (60-day purge from migration
-- 011).
select cron.schedule(
  'delete-old-elections',
  '0 3 * * *',
  $$ delete from public.elections where created_at < now() - interval '60 days' and visibility <> 'public'; $$
);

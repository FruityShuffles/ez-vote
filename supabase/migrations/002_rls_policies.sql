-- ============ PROFILES ============

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can insert their own profile
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============ ELECTIONS ============

-- Owners can do everything with their elections
create policy "Owners can read own elections"
  on public.elections for select
  using (owner_id = auth.uid());

-- Invited users can read elections they're invited to
create policy "Invited users can read elections"
  on public.elections for select
  using (
    exists (
      select 1 from public.invites
      where invites.election_id = elections.id
        and invites.accepted_by = auth.uid()
    )
  );

create policy "Owners can insert elections"
  on public.elections for insert
  with check (owner_id = auth.uid());

create policy "Owners can update own elections"
  on public.elections for update
  using (owner_id = auth.uid());

-- ============ CANDIDATES ============

-- Anyone who can see the election can see candidates
create policy "Election viewers can read candidates"
  on public.candidates for select
  using (
    exists (
      select 1 from public.elections
      where elections.id = candidates.election_id
        and (
          elections.owner_id = auth.uid()
          or exists (
            select 1 from public.invites
            where invites.election_id = elections.id
              and invites.accepted_by = auth.uid()
          )
        )
    )
  );

-- Only election owner can manage candidates
create policy "Owners can insert candidates"
  on public.candidates for insert
  with check (
    exists (
      select 1 from public.elections
      where elections.id = candidates.election_id
        and elections.owner_id = auth.uid()
    )
  );

create policy "Owners can delete candidates"
  on public.candidates for delete
  using (
    exists (
      select 1 from public.elections
      where elections.id = candidates.election_id
        and elections.owner_id = auth.uid()
    )
  );

-- ============ INVITES ============

-- Election owners can read all invites for their elections
create policy "Owners can read invites"
  on public.invites for select
  using (
    exists (
      select 1 from public.elections
      where elections.id = invites.election_id
        and elections.owner_id = auth.uid()
    )
  );

-- Users can read invites that they accepted
create policy "Users can read own accepted invites"
  on public.invites for select
  using (accepted_by = auth.uid());

-- Election owners can create invites
create policy "Owners can insert invites"
  on public.invites for insert
  with check (
    exists (
      select 1 from public.elections
      where elections.id = invites.election_id
        and elections.owner_id = auth.uid()
    )
  );

-- ============ BALLOTS ============

-- Voters can read their own ballots
create policy "Voters can read own ballots"
  on public.ballots for select
  using (voter_id = auth.uid());

-- Election owners can read ballots (for result computation)
create policy "Owners can read ballots"
  on public.ballots for select
  using (
    exists (
      select 1 from public.elections
      where elections.id = ballots.election_id
        and elections.owner_id = auth.uid()
    )
  );

-- Invited users can insert/upsert ballots for open elections
create policy "Invited voters can insert ballots"
  on public.ballots for insert
  with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.elections
      where elections.id = ballots.election_id
        and elections.status = 'open'
    )
    and exists (
      select 1 from public.invites
      where invites.election_id = ballots.election_id
        and invites.accepted_by = auth.uid()
    )
  );

-- Voters can update their own ballots (for upsert)
create policy "Voters can update own ballots"
  on public.ballots for update
  using (
    voter_id = auth.uid()
    and exists (
      select 1 from public.elections
      where elections.id = ballots.election_id
        and elections.status = 'open'
    )
  );

-- ============ RESULTS ============

-- Anyone who can see the election can see results
create policy "Election viewers can read results"
  on public.results for select
  using (
    exists (
      select 1 from public.elections
      where elections.id = results.election_id
        and (
          elections.owner_id = auth.uid()
          or exists (
            select 1 from public.invites
            where invites.election_id = elections.id
              and invites.accepted_by = auth.uid()
          )
        )
    )
  );

-- Only service role / edge functions should insert results
-- This policy allows the election owner (edge function runs with their JWT)
create policy "Owners can insert results"
  on public.results for insert
  with check (
    exists (
      select 1 from public.elections
      where elections.id = results.election_id
        and elections.owner_id = auth.uid()
    )
  );

-- Allow upsert (update existing results)
create policy "Owners can update results"
  on public.results for update
  using (
    exists (
      select 1 from public.elections
      where elections.id = results.election_id
        and elections.owner_id = auth.uid()
    )
  );

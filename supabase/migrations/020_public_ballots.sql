-- Public Ballots election mode (#81)
--
-- 1. Privacy fix: drops the legacy "Owners can read ballots" policy.
--    Compute runs under the service-role key in the edge function and
--    bypasses RLS, so this policy was vestigial — it only widened the
--    visibility ceiling. After this migration, the only paths to read
--    another voter's ballot are the edge function and the new
--    public-ballots policy below.
-- 2. Adds public_ballots flag on elections.
-- 3. Adds election_has_public_ballots() security-definer helper to avoid
--    RLS recursion when a ballots policy inspects the parent election.
-- 4. Adds the new SELECT policy that lets owners and joined voters read
--    every ballot in an election when public_ballots is enabled.
-- 5. Adds get_public_ballots() RPC for the client to fetch ballot
--    payloads alongside voter display names in a single round-trip.

DROP POLICY IF EXISTS "Owners can read ballots" ON public.ballots;

ALTER TABLE public.elections
  ADD COLUMN public_ballots boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.election_has_public_ballots(p_election_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public_ballots FROM public.elections WHERE id = p_election_id;
$$;

CREATE POLICY "Participants can read public ballots"
  ON public.ballots FOR SELECT
  USING (
    public.election_has_public_ballots(election_id)
    AND (
      public.current_user_owns_election(election_id)
      OR EXISTS (
        SELECT 1
          FROM public.election_voters ev
         WHERE ev.election_id = ballots.election_id
           AND ev.user_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_public_ballots(p_election_id uuid)
RETURNS TABLE(
  voter_id uuid,
  display_name text,
  payload jsonb,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public boolean;
  v_owner uuid;
BEGIN
  SELECT e.public_ballots, e.owner_id
    INTO v_public, v_owner
    FROM public.elections e
   WHERE e.id = p_election_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Election not found';
  END IF;

  IF auth.uid() <> v_owner THEN
    IF NOT v_public THEN
      RAISE EXCEPTION 'Public ballots not enabled';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.election_voters
       WHERE election_id = p_election_id
         AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Not a participant';
    END IF;
  END IF;

  RETURN QUERY
    SELECT b.voter_id, p.display_name, b.payload, b.updated_at
      FROM public.ballots b
      LEFT JOIN public.profiles p ON p.id = b.voter_id
     WHERE b.election_id = p_election_id
     ORDER BY p.display_name NULLS LAST, b.created_at;
END;
$$;

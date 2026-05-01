-- Follow-up to migration 020.
--
-- The first cut of get_public_ballots() short-circuited the public_ballots
-- flag check for owners — owner callers received every ballot regardless of
-- the flag. That contradicts the privacy guarantee the new RLS policy
-- enforces (owner reads via the table are gated on public_ballots = true).
-- This migration tightens the RPC so the flag check applies to *all* callers,
-- including the election owner.

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

  IF NOT v_public THEN
    RAISE EXCEPTION 'Public ballots not enabled';
  END IF;

  IF auth.uid() <> v_owner AND NOT EXISTS (
    SELECT 1
      FROM public.election_voters
     WHERE election_id = p_election_id
       AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  RETURN QUERY
    SELECT b.voter_id, p.display_name, b.payload, b.updated_at
      FROM public.ballots b
      LEFT JOIN public.profiles p ON p.id = b.voter_id
     WHERE b.election_id = p_election_id
     ORDER BY p.display_name NULLS LAST, b.created_at;
END;
$$;

-- 013: Ad-hoc candidates, real-time results, and ballot staleness tracking

-- New columns on elections
ALTER TABLE elections
  ADD COLUMN allow_voter_candidates boolean NOT NULL DEFAULT false,
  ADD COLUMN realtime_results boolean NOT NULL DEFAULT false,
  ADD COLUMN candidates_updated_at timestamptz NOT NULL DEFAULT now();

-- Trigger: bump candidates_updated_at when a candidate is inserted
CREATE OR REPLACE FUNCTION bump_candidates_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE elections
     SET candidates_updated_at = now()
   WHERE id = NEW.election_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_bump_candidates_updated_at
  AFTER INSERT ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION bump_candidates_updated_at();

-- Security-definer helper: check if election allows voter-added candidates
-- (avoids RLS recursion)
CREATE OR REPLACE FUNCTION election_allows_voter_candidates(p_election_id uuid)
RETURNS boolean AS $$
  SELECT allow_voter_candidates AND status = 'open'
    FROM elections
   WHERE id = p_election_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS INSERT policy on candidates: voters can add candidates when allowed
CREATE POLICY candidates_voter_insert ON candidates
  FOR INSERT
  WITH CHECK (
    election_allows_voter_candidates(election_id)
    AND EXISTS (
      SELECT 1 FROM election_voters
       WHERE election_voters.election_id = candidates.election_id
         AND election_voters.user_id = auth.uid()
    )
  );

-- 019: Auto-bump ballots.updated_at on row update.
--
-- ballots.updated_at has `default now()` on insert (migration 001) but was
-- never refreshed on UPDATE, leaving the timestamp frozen at insert time
-- and producing misleading signals during triage.

CREATE OR REPLACE FUNCTION bump_ballots_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_ballots_updated_at
  BEFORE UPDATE ON public.ballots
  FOR EACH ROW
  EXECUTE FUNCTION bump_ballots_updated_at();

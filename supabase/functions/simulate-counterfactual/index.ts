// Edge function: simulate-counterfactual (M20)
//
// Answers "what if people had voted differently?" — loads a real election's
// ballots, applies caller-supplied overrides to a copy, re-runs the shared
// `tabulate()` helper on both, and returns the two outcomes side by side.
// Nothing is persisted.
//
// SAFETY, LOAD-BEARING: this function deliberately never reads
// SUPABASE_SERVICE_ROLE_KEY. That absence is the mutation guarantee, so it is
// an intentional omission rather than a gap — do not add the service-role
// client here, even to "just read" something. `compute-results` holds that key
// because it must upsert results and close elections; this endpoint has no
// write path at all, and holding no privileged key is what keeps it that way.
//
// Every read therefore runs as the caller: the election row and candidates
// through row-level security, and all ballots through the `get_public_ballots`
// RPC (migrations 020/021/022), which already enforces `public_ballots = true`
// for every caller including the owner, plus owner-or-joined-voter membership
// on private elections. Reusing that RPC means the privacy rules live in one
// place instead of a second copy here that could drift. Consequence:
// simulation is available only on elections that opted into public ballots.
//
// Callers with no user are allowed (migration 022 / issue #140): they proceed
// on a plain anon-role client, so RLS and the RPC decide what they can reach —
// in practice only elections with `visibility = 'public'`. No identity check
// is needed here because identity was never the authority; the caller's role
// is.
//
// The opt-in searches (`find_flip`, `find_strategy`) are pure compute over the
// data already fetched above — they add no reads and no privileged key, so the
// property holds for them too.
//
// Deploy: supabase functions deploy simulate-counterfactual --no-verify-jwt
// (--no-verify-jwt for the same reason as compute-results: the gateway rejects
// ES256 user JWTs, so identity is verified inside the function.)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tabulate } from "../_shared/tabulate.ts";
import {
  applyOverrides,
  type BallotOverride,
  diffWinners,
  type SimulationBallot,
  validateOverrides,
} from "../_shared/counterfactual.ts";
import {
  findMinimalFlips,
  type FlipSearchResult,
  validateFlipInputs,
} from "../_shared/flip.ts";
import {
  findStrategicOpportunities,
  type StrategicSearchResult,
  validateStrategyInputs,
} from "../_shared/strategy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PublicBallotRow {
  voter_id: string | null;
  payload: SimulationBallot["payload"] | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Anon key + the caller's own JWT, so every query is capped by what that
    // user could already read in the app.
    const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await authedClient.auth.getUser();

    // No user (guest visitor, or a stale/invalid JWT): fall back to a plain
    // anon-role client instead of passing the dead token through to PostgREST.
    // RLS then only exposes publicly viewable elections.
    const userClient = user
      ? authedClient
      : createClient(supabaseUrl, supabaseAnonKey);

    const {
      election_id,
      overrides = [],
      find_flip = false,
      find_strategy = false,
    } = await req.json();
    if (!election_id) throw new Error("election_id required");
    if (typeof find_flip !== "boolean") {
      throw new Error("find_flip must be a boolean");
    }
    if (typeof find_strategy !== "boolean") {
      throw new Error("find_strategy must be a boolean");
    }

    const { data: election, error: electionError } = await userClient
      .from("elections")
      .select("*")
      .eq("id", election_id)
      .maybeSingle();

    if (electionError) throw new Error(electionError.message);
    if (!election) throw new Error("Election not found");

    const { data: candidates, error: candidatesError } = await userClient
      .from("candidates")
      .select("*")
      .eq("election_id", election_id)
      .order("position");

    if (candidatesError) throw new Error(candidatesError.message);

    // Surfaces the RPC's own messages verbatim — "Election not found",
    // "Public ballots not enabled", "Not a participant" — so the client can
    // tell the three apart.
    const { data: publicBallots, error: ballotsError } = await userClient.rpc(
      "get_public_ballots",
      { p_election_id: election_id },
    );

    if (ballotsError) throw new Error(ballotsError.message);

    const baselineBallots: SimulationBallot[] =
      ((publicBallots ?? []) as PublicBallotRow[]).map((row) => ({
        voter_id: row.voter_id,
        payload: row.payload ?? {},
      }));

    const candidateIds = (candidates ?? []).map((c: { id: string }) => c.id);
    const errors = validateOverrides(overrides, baselineBallots, candidateIds);
    if (errors.length > 0) throw new Error(errors.join("; "));

    const applied = overrides as BallotOverride[];
    const simulatedBallots = applyOverrides(baselineBallots, applied);

    // Both sides go through the same tabulate() call, so the baseline is
    // recomputed rather than read from the `results` table. That keeps the two
    // directly comparable and makes the endpoint work on an open election
    // whose results were never persisted.
    const algorithms: string[] = election.algorithms ?? [];
    const baseline = tabulate(
      algorithms,
      election.include_fptp,
      candidates ?? [],
      baselineBallots,
    );
    const simulated = tabulate(
      algorithms,
      election.include_fptp,
      candidates ?? [],
      simulatedBallots,
    );

    // The flip search runs on the BASELINE ballots, not the overridden copy,
    // so every reported change is a valid `replace` override against the live
    // election. `overrides` and `find_flip` may arrive together; the search
    // deliberately ignores the overrides.
    let flip: FlipSearchResult | undefined;
    if (find_flip) {
      const flipErrors = validateFlipInputs(
        algorithms,
        candidates ?? [],
        baselineBallots,
      );
      if (flipErrors.length > 0) throw new Error(flipErrors.join("; "));
      flip = findMinimalFlips(candidates ?? [], baselineBallots);
    }

    // Same contract as the flip search: baseline ballots only, so every
    // reported opportunity is a valid `replace` override against the live
    // election, and any `overrides` in the same request are ignored here.
    //
    // The fallback for elections with no precomputed row (migration 024):
    // everything closed before #149, plus anything whose owner enabled
    // public_ballots after closing. Unlike `find_flip` there is no algorithm
    // requirement — every method has a strategy space.
    let strategy: StrategicSearchResult | undefined;
    if (find_strategy) {
      const strategyErrors = validateStrategyInputs(
        candidates ?? [],
        baselineBallots,
      );
      if (strategyErrors.length > 0) throw new Error(strategyErrors.join("; "));
      strategy = findStrategicOpportunities(
        algorithms,
        election.include_fptp,
        candidates ?? [],
        baselineBallots,
      );
    }

    return new Response(
      JSON.stringify({
        election_id,
        baseline,
        simulated,
        ...(flip !== undefined && { flip }),
        ...(strategy !== undefined && { strategy }),
        changed: diffWinners(baseline, simulated),
        ballot_count: {
          baseline: baselineBallots.length,
          simulated: simulatedBallots.length,
        },
        applied: {
          replace: applied.filter((o) => o.op === "replace").length,
          remove: applied.filter((o) => o.op === "remove").length,
          add: applied.filter((o) => o.op === "add").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

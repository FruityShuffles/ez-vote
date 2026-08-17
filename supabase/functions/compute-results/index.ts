import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type Candidate, tabulate } from "../_shared/tabulate.ts";
import {
  findMinimalFlips,
  type FlipSearchResult,
  PRECOMPUTE_FLIP_MS,
  validateFlipInputs,
} from "../_shared/flip.ts";
import {
  findStrategicOpportunities,
  PRECOMPUTE_STRATEGY_MS,
  type StrategicSearchResult,
  validateStrategyInputs,
} from "../_shared/strategy.ts";
import type { SimulationBallot } from "../_shared/counterfactual.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Precompute and store the IRV flip search for a just-closed election (#146).
 *
 * A closed election's ballots can never change (both ballot write policies
 * require `status = 'open'`), so this answer is final. The what-ifs explorer
 * reads the stored row instead of paying ~500 ms of server search on every
 * visit; `simulate-counterfactual` still answers `find_flip: true` live for
 * elections that have no row.
 *
 * Best-effort, and called strictly AFTER the results are persisted and the
 * election is closed: a failure here costs a cache hit and nothing else. Never
 * throws.
 *
 * Gated on `public_ballots` because the stored payloads embed ballots and
 * because the explorer is unreachable without it. An owner who enables
 * `public_ballots` *after* closing gets no row and falls back to the live
 * search — see migration 023.
 *
 * Note the ballots here come straight from the table, whereas a live search
 * reads them through `get_public_ballots()`, which orders by display name. The
 * greedy breaks ties by array order, so the two paths can name different
 * (equally cheap) ballots for the same election. Both are valid answers under
 * the search's honesty contract, but it makes "re-run and compare" a misleading
 * way to debug this.
 */
function flipSearchFor(
  election: { public_ballots?: boolean },
  algorithms: string[],
  candidates: Candidate[],
  ballots: SimulationBallot[]
): FlipSearchResult | null {
  if (!election.public_ballots) return null;
  // The same gate simulate-counterfactual applies, so eligibility can never
  // drift between the two paths. It also bounds the work before it starts
  // rather than at the CPU ceiling.
  if (validateFlipInputs(algorithms, candidates, ballots).length > 0) {
    return null;
  }
  return findMinimalFlips(candidates, ballots, {
    timeLimitMs: PRECOMPUTE_FLIP_MS,
  });
}

/**
 * Precompute and store the strategic voting search for a just-closed election
 * (#149) — "could any voter have gotten a better outcome by voting
 * differently?", asked per method.
 *
 * Same reasoning as `flipSearchFor` above: final answer, ballots frozen,
 * gated on `public_ballots` because the stored payloads embed ballots.
 * Unlike the flip search this has no algorithm requirement — every method has a
 * strategy space, so any tabulated election is searchable.
 *
 * `remainingMs` is what makes the pair safe. Supabase kills a function at 2 s of
 * CPU, hard and uncatchably, and both searches are pure compute with no awaits,
 * so their wall-clock deadlines are effectively CPU deadlines that ADD UP. The
 * flip search runs first and keeps its full budget; this one gets whatever is
 * left of a fixed allowance. Measured worst case at maximum eligible size (500
 * ballots x 20 candidates) is ~596 ms for the flip search and ~334 ms here, so
 * the pair lands near 930 ms with about a second to spare — see
 * `docs/Backend/Edge Function.md`, "The close-path CPU budget".
 */
function strategySearchFor(
  election: { public_ballots?: boolean },
  algorithms: string[],
  includeFptp: boolean,
  candidates: Candidate[],
  ballots: SimulationBallot[],
  remainingMs: number
): StrategicSearchResult | null {
  if (!election.public_ballots) return null;
  if (remainingMs <= 0) return null;
  if (validateStrategyInputs(candidates, ballots).length > 0) return null;
  return findStrategicOpportunities(algorithms, includeFptp, candidates, ballots, {
    timeLimitMs: Math.min(PRECOMPUTE_STRATEGY_MS, remainingMs),
  });
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user identity using anon key + user's JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { election_id, close = true } = await req.json();
    if (!election_id) throw new Error("election_id required");

    // Create service role client for data operations (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the election
    const { data: election, error: electionError } = await adminClient
      .from("elections")
      .select("*")
      .eq("id", election_id)
      .single();

    if (electionError || !election) throw new Error("Election not found");
    if (election.status !== "open")
      throw new Error("Election must be open to compute results");

    if (close) {
      // Closing: must be owner
      if (election.owner_id !== user.id) throw new Error("Not election owner");
    } else {
      // Real-time compute: must be participant and realtime_results enabled
      if (!election.realtime_results)
        throw new Error("Real-time results not enabled");
      const isOwner = election.owner_id === user.id;
      if (!isOwner) {
        const { data: voter } = await adminClient
          .from("election_voters")
          .select("user_id")
          .eq("election_id", election_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!voter) throw new Error("Not a participant");
      }
    }

    // Fetch candidates and ballots
    const { data: candidates } = await adminClient
      .from("candidates")
      .select("*")
      .eq("election_id", election_id)
      .order("position");

    const { data: ballots } = await adminClient
      .from("ballots")
      .select("*")
      .eq("election_id", election_id);

    const algos: string[] = election.algorithms ?? [];

    // Tabulate all algorithms (plus FPTP comparison if enabled) and persist
    const tabulated = tabulate(
      algos,
      election.include_fptp,
      candidates ?? [],
      ballots ?? []
    );

    for (const { algorithm, result_data } of tabulated) {
      await adminClient.from("results").upsert(
        {
          election_id,
          algorithm,
          result_data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "election_id,algorithm" }
      );
    }

    // Close the election only when requested
    if (close) {
      await adminClient
        .from("elections")
        .update({ status: "closed" })
        .eq("id", election_id);

      // Both precomputes are pure compute with no awaits between them, so this
      // one clock measures the CPU they jointly spend against the 2 s ceiling.
      const precomputeStartedAt = Date.now();
      let flip: FlipSearchResult | null = null;
      let strategy: StrategicSearchResult | null = null;

      // Separate try/catch blocks on purpose: the strategic search is the newer
      // and less exercised of the two, and a failure in it must not cost the
      // shipped flip answer (or vice versa).
      try {
        flip = flipSearchFor(election, algos, candidates ?? [], ballots ?? []);
      } catch (flipError) {
        // Never propagate: the close already succeeded.
        console.error("flip precompute failed", flipError);
      }

      try {
        strategy = strategySearchFor(
          election,
          algos,
          election.include_fptp,
          candidates ?? [],
          ballots ?? [],
          PRECOMPUTE_FLIP_MS + PRECOMPUTE_STRATEGY_MS -
            (Date.now() - precomputeStartedAt)
        );
      } catch (strategyError) {
        console.error("strategy precompute failed", strategyError);
      }

      try {
        // One row holds both answers (migration 024). A row with neither is
        // meaningless, so an election eligible for no search stores nothing and
        // falls back to the live path.
        if (flip || strategy) {
          await adminClient.from("flip_searches").upsert(
            {
              election_id,
              result: flip,
              strategy,
              computed_at: new Date().toISOString(),
            },
            { onConflict: "election_id" }
          );
        }
      } catch (writeError) {
        console.error("counterfactual precompute write failed", writeError);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

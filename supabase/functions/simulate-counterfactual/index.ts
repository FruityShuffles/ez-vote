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
// RPC (migrations 020/021), which already enforces `public_ballots = true` for
// every caller including the owner, plus owner-or-joined-voter membership.
// Reusing that RPC means the privacy rules live in one place instead of a
// second copy here that could drift. Consequence: simulation is available only
// on elections that opted into public ballots.
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

    // The only client in this function: anon key + the caller's own JWT, so
    // every query is capped by what that user could already read in the app.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { election_id, overrides = [] } = await req.json();
    if (!election_id) throw new Error("election_id required");

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

    return new Response(
      JSON.stringify({
        election_id,
        baseline,
        simulated,
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

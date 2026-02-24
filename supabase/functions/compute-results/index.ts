import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Candidate {
  id: string;
  name: string;
  position: number;
}

interface Ballot {
  payload: {
    approval?: string[];
    irv?: string[];
    star?: Record<string, number>;
  };
}

// ---- Approval Voting ----
function computeApproval(
  candidates: Candidate[],
  ballots: Ballot[]
): Record<string, unknown> {
  const tallies: Record<string, number> = {};
  const nameMap: Record<string, string> = {};

  for (const c of candidates) {
    tallies[c.id] = 0;
    nameMap[c.id] = c.name;
  }

  for (const b of ballots) {
    const approved = b.payload.approval ?? [];
    for (const cid of approved) {
      if (tallies[cid] !== undefined) {
        tallies[cid]++;
      }
    }
  }

  // Sort by tally desc (no arbitrary tie-break — genuine ties remain)
  const sorted = Object.entries(tallies).sort((a, b) => b[1] - a[1]);

  const namedTallies: Record<string, number> = {};
  for (const [id, count] of sorted) {
    namedTallies[nameMap[id]] = count;
  }

  if (sorted.length === 0) {
    return { winners: [], winner: null, runner_up: null, tallies: namedTallies };
  }

  const topTally = sorted[0][1];
  const winners = sorted
    .filter(([_, v]) => v === topTally)
    .map(([id]) => nameMap[id]);

  // runner_up: first candidate NOT in winners (by tally desc)
  const runnerUpEntry = sorted.find(([id]) => !winners.includes(nameMap[id]));
  const runner_up = runnerUpEntry ? nameMap[runnerUpEntry[0]] : null;

  return {
    winners,
    winner: winners[0],
    runner_up,
    tallies: namedTallies,
  };
}

// ---- Instant Runoff Voting ----
function computeIRV(
  candidates: Candidate[],
  ballots: Ballot[]
): Record<string, unknown> {
  const nameMap: Record<string, string> = {};
  for (const c of candidates) {
    nameMap[c.id] = c.name;
  }

  let remaining = new Set(candidates.map((c) => c.id));
  const rankings = ballots
    .map((b) => (b.payload.irv ?? []).filter((id) => remaining.has(id)))
    .filter((r) => r.length > 0);

  const rounds: Array<Record<string, unknown>> = [];

  while (remaining.size > 1) {
    // Count first-choice votes
    const counts: Record<string, number> = {};
    for (const id of remaining) {
      counts[id] = 0;
    }

    for (const ranking of rankings) {
      const firstChoice = ranking.find((id) => remaining.has(id));
      if (firstChoice) {
        counts[firstChoice]++;
      }
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const namedCounts: Record<string, number> = {};
    for (const [id, count] of Object.entries(counts)) {
      namedCounts[nameMap[id]] = count;
    }

    // Sort desc by votes (no tie-break)
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const minVotes = sorted[sorted.length - 1][1];

    // Check for majority
    if (sorted[0][1] > total / 2) {
      rounds.push({ counts: namedCounts, eliminated: null });
      break;
    }

    // Eliminate ALL candidates tied for fewest votes
    const toEliminate = sorted
      .filter(([_, v]) => v === minVotes)
      .map(([id]) => id);

    // If every remaining candidate is tied for last → all are co-winners
    if (toEliminate.length === remaining.size) {
      rounds.push({ counts: namedCounts, eliminated: null });
      break;
    }

    rounds.push({
      counts: namedCounts,
      eliminated: toEliminate.map((id) => nameMap[id]),
    });

    remaining = new Set([...remaining].filter((id) => !toEliminate.includes(id)));
  }

  if (remaining.size === 0) {
    return { winners: [], winner: null, runner_up: null, rounds };
  }

  // Determine winners from the last round's vote counts
  const lastRound = rounds[rounds.length - 1];
  const finalCounts = lastRound?.counts as Record<string, number> | undefined;

  let winners: string[];
  let runnerUp: string | null = null;

  if (remaining.size === 1) {
    winners = [[...remaining][0]].map((id) => nameMap[id]);
    // Runner-ups: all candidates eliminated in the final round
    const lastElimRound = [...rounds]
      .reverse()
      .find((r) => Array.isArray(r.eliminated) && (r.eliminated as string[]).length > 0);
    const runnerUpNames = lastElimRound?.eliminated as string[] | undefined;
    if (runnerUpNames && runnerUpNames.length === 1) {
      runnerUp = runnerUpNames[0];
    } else if (runnerUpNames && runnerUpNames.length > 1) {
      runnerUp = runnerUpNames.join(" & ");
    }
  } else if (finalCounts) {
    const remainingIds = [...remaining];
    const maxCount = Math.max(
      ...remainingIds.map((id) => finalCounts[nameMap[id]] ?? 0)
    );
    winners = remainingIds
      .filter((id) => (finalCounts[nameMap[id]] ?? 0) === maxCount)
      .map((id) => nameMap[id]);

    // runner_up: first remaining candidate not in winners
    const runnerUpId = remainingIds.find((id) => !winners.includes(nameMap[id]));
    runnerUp = runnerUpId ? nameMap[runnerUpId] : null;
  } else {
    winners = [...remaining].map((id) => nameMap[id]);
  }

  return {
    winners,
    winner: winners.length > 0 ? winners[0] : null,
    runner_up: runnerUp,
    rounds,
  };
}

// ---- STAR Voting ----
function computeSTAR(
  candidates: Candidate[],
  ballots: Ballot[]
): Record<string, unknown> {
  const nameMap: Record<string, string> = {};
  for (const c of candidates) {
    nameMap[c.id] = c.name;
  }

  // Scoring round: sum all scores
  const scores: Record<string, number> = {};
  for (const c of candidates) {
    scores[c.id] = 0;
  }

  for (const b of ballots) {
    const starVotes = b.payload.star ?? {};
    for (const [cid, score] of Object.entries(starVotes)) {
      if (scores[cid] !== undefined) {
        scores[cid] += score;
      }
    }
  }

  // Find top 2 by score (no arbitrary ID tie-break)
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (sorted.length < 2) {
    const namedScores: Record<string, number> = {};
    for (const [id, score] of sorted) {
      namedScores[nameMap[id]] = score;
    }
    const singleWinner = sorted.length > 0 ? nameMap[sorted[0][0]] : null;
    return {
      winners: singleWinner ? [singleWinner] : [],
      winner: singleWinner,
      runner_up: null,
      scores: namedScores,
      runoff: null,
    };
  }

  const finalist1 = sorted[0][0];
  const finalist2 = sorted[1][0];

  // Runoff: count how many ballots prefer each finalist
  let pref1 = 0;
  let pref2 = 0;

  for (const b of ballots) {
    const starVotes = b.payload.star ?? {};
    const s1 = starVotes[finalist1] ?? 0;
    const s2 = starVotes[finalist2] ?? 0;
    if (s1 > s2) pref1++;
    else if (s2 > s1) pref2++;
  }

  let winners: string[];
  let runnerUp: string | null;

  if (pref1 > pref2) {
    winners = [nameMap[finalist1]];
    runnerUp = nameMap[finalist2];
  } else if (pref2 > pref1) {
    winners = [nameMap[finalist2]];
    runnerUp = nameMap[finalist1];
  } else {
    // Runoff tie: use total score as tie-breaker
    if (scores[finalist1] > scores[finalist2]) {
      winners = [nameMap[finalist1]];
      runnerUp = nameMap[finalist2];
    } else if (scores[finalist2] > scores[finalist1]) {
      winners = [nameMap[finalist2]];
      runnerUp = nameMap[finalist1];
    } else {
      // Score also tied: both finalists are co-winners
      winners = [nameMap[finalist1], nameMap[finalist2]];
      runnerUp = null;
    }
  }

  const namedScores: Record<string, number> = {};
  for (const [id, score] of sorted) {
    namedScores[nameMap[id]] = score;
  }

  return {
    winners,
    winner: winners[0],
    runner_up: runnerUp,
    scores: namedScores,
    runoff: {
      [nameMap[finalist1]]: pref1,
      [nameMap[finalist2]]: pref2,
    },
  };
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
          .select("id")
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

    // Compute results for each algorithm
    for (const algo of algos) {
      let resultData: Record<string, unknown> = {};

      switch (algo) {
        case "approval":
          resultData = computeApproval(candidates ?? [], ballots ?? []);
          break;
        case "irv":
          resultData = computeIRV(candidates ?? [], ballots ?? []);
          break;
        case "star":
          resultData = computeSTAR(candidates ?? [], ballots ?? []);
          break;
      }

      await adminClient.from("results").upsert(
        {
          election_id,
          algorithm: algo,
          result_data: resultData,
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

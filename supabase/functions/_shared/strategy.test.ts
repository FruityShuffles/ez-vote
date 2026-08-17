// Unit tests for the strategic voting search (#149).
//
// Like `flip.test.ts`, deliberately not fixture-driven: the golden corpus in
// `tabulate.test.ts` locks *algorithm* behavior, and this module drives the
// tabulator as a black box. What needs guarding here is the search contract,
// and two properties of it above all:
//
//   * ROUND-TRIP HONESTY. Every reported opportunity must replay through the
//     same overrides path the endpoint exposes and produce exactly the claimed
//     winners, with the claimed improvement for that voter.
//   * ISOLATION. A reported payload differs from the honest one in exactly one
//     method's key, and leaves every other method's winners untouched. This is
//     the executable form of the module's first governing rule.

import { assert, assertEquals } from "@std/assert";
import {
  findStrategicOpportunities,
  MAX_STRATEGY_BALLOTS,
  MAX_STRATEGY_CANDIDATES,
  type StrategicOpportunity,
  type StrategicSearchResult,
  validateStrategyInputs,
} from "./strategy.ts";
import {
  applyOverrides,
  type BallotPayload,
  type SimulationBallot,
} from "./counterfactual.ts";
import { type Candidate, computeFPTP, tabulate } from "./tabulate.ts";

const CANDIDATES: Candidate[] = [
  { id: "cand-a", name: "Alice", position: 0 },
  { id: "cand-b", name: "Bob", position: 1 },
  { id: "cand-c", name: "Carol", position: 2 },
];

const A = "cand-a";
const B = "cand-b";
const C = "cand-c";

const PAYLOAD_KEYS = ["approval", "irv", "star", "fptp"] as const;

let nextVoter = 0;
function ballot(payload: BallotPayload): SimulationBallot {
  nextVoter += 1;
  return { voter_id: `voter-${nextVoter}`, payload };
}

function repeat(count: number, payload: BallotPayload): SimulationBallot[] {
  return Array.from({ length: count }, () => ballot({ ...payload }));
}

function winnersFor(
  method: string,
  candidates: Candidate[],
  ballots: SimulationBallot[],
  hasIrv: boolean,
): string[] {
  const data = method === "fptp"
    ? computeFPTP(candidates, ballots, hasIrv)
    : tabulate([method], false, candidates, ballots)[0].result_data;
  return (data.winners as string[]) ?? [];
}

/// The honesty contract, asserted for every reported opportunity: replaying the
/// change through `applyOverrides` must reproduce the claimed winners exactly,
/// and the isolation rule must hold against every other enabled method.
function assertHonest(
  result: StrategicSearchResult,
  ballots: SimulationBallot[],
  algorithms: string[],
  includeFptp: boolean,
  candidates: Candidate[] = CANDIDATES,
): void {
  const hasIrv = algorithms.includes("irv");
  for (const opportunity of result.opportunities) {
    const original = ballots.find((b) => b.voter_id === opportunity.voter_id);
    assert(original !== undefined, `no ballot for ${opportunity.voter_id}`);

    // --- Isolation: only this method's key is rewritten. ---
    //
    // `fptp` is allowed to appear alongside `irv` on one condition: it must
    // hold the voter's own honest effective pick. FPTP has no key of its own on
    // an IRV ballot, so pinning it is what KEEPS the FPTP count still while the
    // ranking changes — the opposite of a second edit. Any other value is a
    // real second change and fails here.
    const differing = PAYLOAD_KEYS.filter(
      (key) =>
        JSON.stringify(original.payload[key] ?? null) !==
          JSON.stringify(opportunity.payload[key] ?? null),
    );
    const pinned = differing.filter(
      (key) =>
        key === "fptp" &&
        opportunity.algorithm !== "fptp" &&
        opportunity.payload.fptp ===
          (original.payload.fptp ?? original.payload.irv?.[0]),
    );
    assertEquals(
      differing.filter((key) => !pinned.includes(key)),
      [opportunity.algorithm],
      `${opportunity.algorithm} opportunity rewrote ${differing.join(", ")}`,
    );

    const replayed = applyOverrides(ballots, [
      {
        op: "replace",
        voter_id: opportunity.voter_id,
        payload: opportunity.payload,
      },
    ]);

    // --- Round trip: the claimed winners are the real ones. ---
    assertEquals(
      winnersFor(opportunity.algorithm, candidates, replayed, hasIrv),
      opportunity.winners,
      `${opportunity.algorithm} winners do not replay`,
    );
    assertEquals(
      winnersFor(opportunity.algorithm, candidates, ballots, hasIrv),
      opportunity.baseline_winners,
      `${opportunity.algorithm} baseline does not replay`,
    );
    assert(
      JSON.stringify(opportunity.winners) !==
        JSON.stringify(opportunity.baseline_winners),
      "reported an opportunity that does not change the winners",
    );

    // --- Isolation: no other method's winners moved. ---
    const others = [
      ...algorithms.filter((a) => a !== opportunity.algorithm),
      ...(includeFptp && opportunity.algorithm !== "fptp" ? ["fptp"] : []),
    ];
    for (const other of others) {
      assertEquals(
        winnersFor(other, candidates, replayed, hasIrv),
        winnersFor(other, candidates, ballots, hasIrv),
        `a ${opportunity.algorithm} change moved ${other}`,
      );
    }
  }
}

function only(
  result: StrategicSearchResult,
  algorithm: string,
): StrategicOpportunity[] {
  return result.opportunities.filter((o) => o.algorithm === algorithm);
}

// ---------------------------------------------------------------------------
// IRV compromise
// ---------------------------------------------------------------------------
//
// A6 B4 C5 in round 1. Bob is eliminated and his ballots transfer to Alice, so
// Alice wins 10–5 — the LAST choice of every Carol voter. Moving Bob to the top
// of one Carol ballot makes Carol the one eliminated instead; her five ballots
// transfer to Bob, who wins 9–6. The voter's second choice beats their third,
// and they got there by not voting for their favourite.

function irvCompromiseBallots(): SimulationBallot[] {
  nextVoter = 0;
  return [
    ...repeat(6, { irv: [A, B, C] }),
    ...repeat(4, { irv: [B, A, C] }),
    ...repeat(5, { irv: [C, B, A] }),
  ];
}

Deno.test("strategy: IRV compromise is found, verified, and isolated", () => {
  const ballots = irvCompromiseBallots();
  const result = findStrategicOpportunities(["irv"], false, CANDIDATES, ballots);

  assertEquals(result.algorithms_searched, ["irv"]);
  assertHonest(result, ballots, ["irv"], false);

  const carol = only(result, "irv").find((o) =>
    ballots.find((b) => b.voter_id === o.voter_id)?.payload.irv?.[0] === C
  );
  assert(carol !== undefined, "no opportunity found for a Carol voter");
  assertEquals(carol.baseline_winners, ["Alice"]);
  assertEquals(carol.winners, ["Bob"]);
  assertEquals(carol.payload.irv, [B, C, A]);
  // Five voters cast that identical ballot; the answer is reported once.
  assertEquals(carol.shared_by, 5);
});

Deno.test("strategy: a voter whose favourite already won is never offered one", () => {
  const ballots = irvCompromiseBallots();
  const result = findStrategicOpportunities(["irv"], false, CANDIDATES, ballots);

  for (const opportunity of only(result, "irv")) {
    const honest = ballots.find((b) => b.voter_id === opportunity.voter_id);
    assert(
      honest?.payload.irv?.[0] !== A,
      "offered a strategy to a voter who already elected their favourite",
    );
  }
});

// ---------------------------------------------------------------------------
// Approval: withdrawing support from a second favourite
// ---------------------------------------------------------------------------
//
// Bob leads Alice 5–4 on approvals. One voter who honestly approves both
// (scoring Alice 5, Bob 3) can drop Bob and pull the two level, turning a loss
// for their favourite into a tie — a real gain under a uniform-lottery reading
// of a tied outcome.

function approvalBallots(): SimulationBallot[] {
  nextVoter = 0;
  return [
    // The strategic voter: prefers Alice, but approves Bob too.
    ...repeat(1, { approval: [A, B], star: { [A]: 5, [B]: 3, [C]: 0 } }),
    ...repeat(3, { approval: [A], star: { [A]: 5, [B]: 0, [C]: 1 } }),
    ...repeat(4, { approval: [B], star: { [B]: 5, [A]: 0, [C]: 1 } }),
    ...repeat(2, { approval: [C], star: { [C]: 5, [A]: 1, [B]: 0 } }),
  ];
}

Deno.test("strategy: approval withdrawal turns a loss into a tie", () => {
  const ballots = approvalBallots();
  const algorithms = ["approval", "star"];
  const result = findStrategicOpportunities(
    algorithms,
    false,
    CANDIDATES,
    ballots,
  );

  assertHonest(result, ballots, algorithms, false);

  const found = only(result, "approval").find(
    (o) => o.voter_id === ballots[0].voter_id,
  );
  assert(found !== undefined, "the dual-approver was offered nothing");
  assertEquals(found.baseline_winners, ["Bob"]);
  assertEquals(found.winners.sort(), ["Alice", "Bob"]);
  assertEquals(found.payload.approval, [A]);
  // The STAR key is carried through untouched — the isolation rule.
  assertEquals(found.payload.star, ballots[0].payload.star);
});

// ---------------------------------------------------------------------------
// FPTP, including the derived-pick case
// ---------------------------------------------------------------------------
//
// Alice cannot win; Bob and Carol are tied. A voter who honestly picks Alice
// but rates Carol above Bob can break the tie in Carol's favour. In the derived
// variant the ballots carry no explicit `fptp` at all — FPTP reads `irv[0]` —
// so the trial writes the key that was never there, which changes FPTP's count
// and leaves IRV's untouched.

Deno.test("strategy: FPTP compromise on an explicit pick", () => {
  nextVoter = 0;
  const ballots = [
    ...repeat(1, { fptp: A, approval: [A, C] }),
    ...repeat(2, { fptp: A, approval: [A] }),
    ...repeat(4, { fptp: B, approval: [B] }),
    ...repeat(4, { fptp: C, approval: [C] }),
  ];
  const result = findStrategicOpportunities(
    ["approval"],
    true,
    CANDIDATES,
    ballots,
  );

  assertHonest(result, ballots, ["approval"], true);

  const found = only(result, "fptp").find(
    (o) => o.voter_id === ballots[0].voter_id,
  );
  assert(found !== undefined, "the Alice-first voter was offered nothing");
  assertEquals(found.baseline_winners.sort(), ["Bob", "Carol"]);
  assertEquals(found.winners, ["Carol"]);
  assertEquals(found.payload.fptp, C);
});

Deno.test("strategy: FPTP compromise where the pick is derived from the ranking", () => {
  nextVoter = 0;
  const ballots = [
    ...repeat(1, { irv: [A, C, B] }),
    ...repeat(2, { irv: [A, B, C] }),
    ...repeat(4, { irv: [B, A, C] }),
    ...repeat(4, { irv: [C, A, B] }),
  ];
  const algorithms = ["irv"];
  const result = findStrategicOpportunities(
    algorithms,
    true,
    CANDIDATES,
    ballots,
  );

  assertHonest(result, ballots, algorithms, true);

  const found = only(result, "fptp").find(
    (o) => o.voter_id === ballots[0].voter_id,
  );
  assert(found !== undefined, "the derived-pick voter was offered nothing");
  // The honest ballot carried no `fptp` key at all.
  assertEquals(ballots[0].payload.fptp, undefined);
  assertEquals(found.payload.fptp, C);
  assertEquals(found.payload.irv, [A, C, B]);
  assertEquals(found.baseline_winners.sort(), ["Bob", "Carol"]);
  assertEquals(found.winners, ["Carol"]);
});

// ---------------------------------------------------------------------------
// STAR
// ---------------------------------------------------------------------------
//
// Bob and Carol are the finalists and Bob wins the runoff. A voter who scored
// Carol 3 and Bob 2 can raise Carol to 5 and drop Bob to 0 — the score change
// alone does not move the finalists, but it moves the runoff.

Deno.test("strategy: a STAR score change moves the runoff", () => {
  nextVoter = 0;
  const ballots = [
    ...repeat(1, { star: { [A]: 1, [B]: 2, [C]: 3 } }),
    ...repeat(3, { star: { [A]: 0, [B]: 5, [C]: 4 } }),
    ...repeat(3, { star: { [A]: 0, [B]: 4, [C]: 5 } }),
    ...repeat(1, { star: { [A]: 5, [B]: 3, [C]: 0 } }),
  ];
  const result = findStrategicOpportunities(["star"], false, CANDIDATES, ballots);

  assertHonest(result, ballots, ["star"], false);
  assert(
    only(result, "star").length > 0,
    "no STAR opportunity found in a one-vote runoff",
  );
});

// The runoff-boundary case, which the plan for #149 flagged as possibly
// undemonstrable: can one ballot both change WHICH candidates reach the runoff
// and improve its own voter's outcome? It can, and this is the profile.
//
// Scores land at Alice 49, Bob 42, Carol 41, so Alice and Bob are the finalists
// and Alice takes the runoff 7–3. The voter scored Bob 5, Carol 4, Alice 1 —
// their favourite is a finalist and still loses. Dropping Bob to 0 costs Bob
// five points and puts Carol into the runoff instead, where Carol beats Alice
// 10–4. The voter improves by burying the candidate they like most.
Deno.test("strategy: a STAR ballot can change who reaches the runoff", () => {
  nextVoter = 0;
  const ballots = [
    ...repeat(1, { star: { [A]: 1, [B]: 5, [C]: 4 } }),
    ...repeat(7, { star: { [A]: 4, [B]: 1, [C]: 5 } }),
    ...repeat(4, { star: { [A]: 5, [B]: 5, [C]: 0 } }),
    ...repeat(2, { star: { [A]: 0, [B]: 5, [C]: 1 } }),
  ];
  const result = findStrategicOpportunities(["star"], false, CANDIDATES, ballots);

  assertHonest(result, ballots, ["star"], false);

  const found = only(result, "star").find(
    (o) => o.voter_id === ballots[0].voter_id,
  );
  assert(found !== undefined, "the boundary voter was offered nothing");
  assertEquals(found.baseline_winners, ["Alice"]);
  assertEquals(found.winners, ["Carol"]);
  assertEquals(found.payload.star?.[B], 0);
});

// ---------------------------------------------------------------------------
// Nothing to find
// ---------------------------------------------------------------------------

// Every method's screen is conservative — it only skips what NO single ballot
// could move — so this profile has to be lopsided on all four counts at once:
// 20–2 on approvals and first preferences, and a STAR field where the runner-up
// is more than one ballot's 5 points clear of third place.
Deno.test("strategy: a landslide is screened out before any trial runs", () => {
  nextVoter = 0;
  const ballots = [
    ...repeat(20, {
      irv: [A, B, C],
      approval: [A],
      star: { [A]: 5, [B]: 1, [C]: 0 },
      fptp: A,
    }),
    ...repeat(2, {
      irv: [B, C, A],
      approval: [B],
      star: { [B]: 5, [C]: 1, [A]: 0 },
      fptp: B,
    }),
  ];
  const algorithms = ["approval", "irv", "star"];
  const result = findStrategicOpportunities(
    algorithms,
    true,
    CANDIDATES,
    ballots,
  );

  assertEquals(result.opportunities, []);
  assertEquals(result.algorithms_searched, []);
  // One baseline tabulation per method and not one more.
  assertEquals(result.tabulations_used, 4);
  assertEquals(result.budget_exhausted, false);
});

Deno.test("strategy: unanimity yields nothing", () => {
  nextVoter = 0;
  const ballots = repeat(9, { irv: [A, B, C] });
  const result = findStrategicOpportunities(["irv"], false, CANDIDATES, ballots);
  assertEquals(result.opportunities, []);
});

Deno.test("strategy: ballots with no voter_id are never reported", () => {
  nextVoter = 0;
  const ballots: SimulationBallot[] = [
    ...repeat(6, { irv: [A, B, C] }),
    ...repeat(4, { irv: [B, A, C] }),
    ...Array.from({ length: 5 }, () => ({
      voter_id: null,
      payload: { irv: [C, B, A] },
    })),
  ];
  const result = findStrategicOpportunities(["irv"], false, CANDIDATES, ballots);
  for (const opportunity of result.opportunities) {
    assert(
      opportunity.voter_id !== null && opportunity.voter_id !== undefined,
      "reported an unattributable ballot",
    );
  }
  assertHonest(result, ballots, ["irv"], false);
});

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

Deno.test("strategy: exhausting the budget keeps every verified finding", () => {
  const ballots = irvCompromiseBallots();
  const full = findStrategicOpportunities(["irv"], false, CANDIDATES, ballots);
  const starved = findStrategicOpportunities(
    ["irv"],
    false,
    CANDIDATES,
    ballots,
    { budget: 3 },
  );

  assertEquals(starved.budget, 3);
  assertEquals(starved.budget_exhausted, true);
  assert(starved.tabulations_used <= 3);
  assert(starved.opportunities.length <= full.opportunities.length);
  assertHonest(starved, ballots, ["irv"], false);
});

Deno.test("strategy: a zero deadline returns an empty, honest result", () => {
  const ballots = irvCompromiseBallots();
  const result = findStrategicOpportunities(
    ["irv"],
    false,
    CANDIDATES,
    ballots,
    { timeLimitMs: -1 },
  );
  assertEquals(result.opportunities, []);
  assertEquals(result.budget_exhausted, true);
  assertEquals(result.tabulations_used, 0);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

Deno.test("strategy: input caps mirror the flip search's", () => {
  nextVoter = 0;
  assertEquals(validateStrategyInputs(CANDIDATES, repeat(3, { irv: [A] })), []);

  const tooManyBallots = validateStrategyInputs(
    CANDIDATES,
    repeat(MAX_STRATEGY_BALLOTS + 1, { irv: [A] }),
  );
  assertEquals(tooManyBallots.length, 1);

  const tooManyCandidates = validateStrategyInputs(
    Array.from({ length: MAX_STRATEGY_CANDIDATES + 1 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      position: i,
    })),
    [],
  );
  assertEquals(tooManyCandidates.length, 1);
});

Deno.test("strategy: an election with no algorithms searches nothing", () => {
  nextVoter = 0;
  const ballots = repeat(4, { irv: [A, B, C] });
  const result = findStrategicOpportunities([], false, CANDIDATES, ballots);
  assertEquals(result.algorithms_searched, []);
  assertEquals(result.opportunities, []);
  assertEquals(result.tabulations_used, 0);
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

Deno.test("strategy: identical ballots are searched once and counted", () => {
  const ballots = irvCompromiseBallots();
  const result = findStrategicOpportunities(["irv"], false, CANDIDATES, ballots);

  assertEquals(result.distinct_ballots, 3);
  assertEquals(result.ballots_examined, 15);
  const voters = result.opportunities.map((o) => o.voter_id);
  assertEquals(new Set(voters).size, voters.length);
});

// ---------------------------------------------------------------------------
// Input immutability
// ---------------------------------------------------------------------------

Deno.test("strategy: the input ballots are never mutated", () => {
  const ballots = irvCompromiseBallots();
  const before = JSON.stringify(ballots);
  findStrategicOpportunities(["approval", "irv", "star"], true, CANDIDATES, ballots);
  assertEquals(JSON.stringify(ballots), before);
});

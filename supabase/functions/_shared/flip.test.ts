// Unit tests for the IRV flip search (M20b, #120).
//
// Deliberately not fixture-driven: the golden corpus in `tabulate.test.ts`
// locks *algorithm* behavior, and this module drives tabulate() as a black
// box. What needs guarding here is the search contract — above all its
// honesty: every `flipped` answer must replay through the overrides path to a
// real flip (the round-trip helper), and the statuses must never promise more
// than the heuristic delivers (`no_flip_found` ≠ impossible, `proven` only at
// k = 1).

import { assert, assertEquals } from "@std/assert";
import {
  findMinimalFlips,
  type FlipSearchResult,
  type FlipTarget,
  MAX_FLIP_BALLOTS,
  MAX_FLIP_CANDIDATES,
  validateFlipInputs,
} from "./flip.ts";
import { applyOverrides, type SimulationBallot } from "./counterfactual.ts";
import { type Candidate, tabulate } from "./tabulate.ts";

const CANDIDATES: Candidate[] = [
  { id: "cand-a", name: "Alice", position: 0 },
  { id: "cand-b", name: "Bob", position: 1 },
  { id: "cand-c", name: "Carol", position: 2 },
];

function irvBallot(
  voter_id: string | null,
  ranking: string[],
): SimulationBallot {
  return { voter_id, payload: { irv: ranking } };
}

function targetFor(result: FlipSearchResult, candidateId: string): FlipTarget {
  const target = result.algorithms[0].targets.find(
    (t) => t.candidate_id === candidateId,
  );
  assert(target !== undefined, `no target entry for ${candidateId}`);
  return target;
}

/// The honesty contract: a `flipped` answer must actually flip when its
/// changes are replayed through the same overrides path the endpoint exposes.
function assertRoundTrip(
  target: FlipTarget,
  ballots: SimulationBallot[],
): void {
  assertEquals(target.status, "flipped");
  const overrides = (target.changes ?? []).map((c) => ({
    op: "replace" as const,
    voter_id: c.voter_id,
    payload: c.payload,
  }));
  const replayed = tabulate(
    ["irv"],
    false,
    CANDIDATES,
    applyOverrides(ballots, overrides),
  );
  const winners = replayed[0].result_data.winners as string[];
  assert(
    winners.includes(target.candidate_name),
    `replayed changes do not make ${target.candidate_name} a winner: ${winners}`,
  );
}

// Baseline: A2 B3 C3 → Alice eliminated, her changeable ballot transfers to
// Bob → Bob wins 4–3. Moving Carol to second place on that one ballot
// redirects the transfer, so Carol wins 4–3 instead: k = 1 at distance 1.
function transferBallots(): SimulationBallot[] {
  return [
    irvBallot(null, ["cand-a"]),
    irvBallot(null, ["cand-b"]),
    irvBallot(null, ["cand-b"]),
    irvBallot(null, ["cand-b"]),
    irvBallot(null, ["cand-c"]),
    irvBallot(null, ["cand-c"]),
    irvBallot(null, ["cand-c"]),
    irvBallot("voter-x", ["cand-a", "cand-b", "cand-c"]),
  ];
}

Deno.test("flip: a k=1 transfer flip is found, minimized, and proven", () => {
  const ballots = transferBallots();
  const result = findMinimalFlips(CANDIDATES, ballots);

  assertEquals(result.algorithms[0].baseline_winners, ["Bob"]);

  const carol = targetFor(result, "cand-c");
  assertEquals(carol.status, "flipped");
  assertEquals(carol.k, 1);
  assertEquals(carol.proven, true);
  assertEquals(carol.winners, ["Carol"]);
  // Ladder-minimized: NOT the max-favorable [C,A,B] the greedy tried first,
  // but the voter's original ranking with Carol bubbled up a single step.
  assertEquals(carol.changes, [
    {
      voter_id: "voter-x",
      payload: { irv: ["cand-a", "cand-c", "cand-b"] },
      distance: 1,
    },
  ]);
  assertRoundTrip(carol, ballots);

  assertEquals(result.algorithms[0].best, "cand-c");
  assertEquals(result.budget_exhausted, false);
});

Deno.test("flip: the baseline winner emits no target entry", () => {
  const result = findMinimalFlips(CANDIDATES, transferBallots());

  assertEquals(
    result.algorithms[0].targets.map((t) => t.candidate_id).sort(),
    ["cand-a", "cand-c"],
  );
});

Deno.test("flip: entering a tie counts as a flip", () => {
  // A3 B1 (C unranked everywhere): Alice wins on majority. One conversion
  // makes it 2–2, and computeIRV reports both as co-winners.
  const ballots = [
    irvBallot("voter-1", ["cand-a", "cand-b"]),
    irvBallot("voter-2", ["cand-a", "cand-b"]),
    irvBallot("voter-3", ["cand-a", "cand-b"]),
    irvBallot("voter-4", ["cand-b", "cand-a"]),
  ];
  const result = findMinimalFlips(CANDIDATES, ballots);

  const bob = targetFor(result, "cand-b");
  assertEquals(bob.status, "flipped");
  assertEquals(bob.k, 1);
  assertEquals(bob.winners, ["Alice", "Bob"]);
  assertRoundTrip(bob, ballots);
});

Deno.test("flip: k=2 is reported as an unproven upper bound", () => {
  // A4 B1: Bob needs two conversions to reach a 3–2 majority.
  const ballots = [
    irvBallot("voter-1", ["cand-a", "cand-b"]),
    irvBallot("voter-2", ["cand-a", "cand-b"]),
    irvBallot("voter-3", ["cand-a", "cand-b"]),
    irvBallot("voter-4", ["cand-a", "cand-b"]),
    irvBallot("voter-5", ["cand-b", "cand-a"]),
  ];
  const result = findMinimalFlips(CANDIDATES, ballots);

  const bob = targetFor(result, "cand-b");
  assertEquals(bob.status, "flipped");
  assertEquals(bob.k, 2);
  assertEquals(bob.proven, false);
  assertRoundTrip(bob, ballots);
});

Deno.test("flip: an unranked target is inserted, not granted a full rewrite", () => {
  // B2, with Alice and Carol on one first-choice vote each — both are bulk-
  // eliminated and Bob wins. The changeable ballot ranks only Alice; the
  // minimal found change is the ranking [C, A] (insert Carol, bubble once):
  // Alice then drops to zero, only she is eliminated, and Bob/Carol tie.
  const ballots = [
    irvBallot(null, ["cand-b"]),
    irvBallot(null, ["cand-b"]),
    irvBallot(null, ["cand-c"]),
    irvBallot("voter-x", ["cand-a"]),
  ];
  const result = findMinimalFlips(CANDIDATES, ballots);

  const carol = targetFor(result, "cand-c");
  assertEquals(carol.status, "flipped");
  assertEquals(carol.changes, [
    {
      voter_id: "voter-x",
      payload: { irv: ["cand-c", "cand-a"] },
      distance: 2,
    },
  ]);
  assertRoundTrip(carol, ballots);
});

Deno.test("flip: only the irv key is edited; other payload keys survive", () => {
  const ballots = transferBallots();
  ballots[7] = {
    voter_id: "voter-x",
    payload: {
      irv: ["cand-a", "cand-b", "cand-c"],
      star: { "cand-a": 5, "cand-b": 2 },
      approval: ["cand-a"],
      fptp: "cand-a",
    },
  };
  const result = findMinimalFlips(CANDIDATES, ballots);

  const carol = targetFor(result, "cand-c");
  assertEquals(carol.changes?.[0].payload, {
    irv: ["cand-a", "cand-c", "cand-b"],
    star: { "cand-a": 5, "cand-b": 2 },
    approval: ["cand-a"],
    fptp: "cand-a",
  });
});

// 8×A>B>C, 5×B>A>C, 7×C>B>A: Bob is eliminated first and his transfers hand
// Alice a 13–7 win. Carol only becomes reachable after enough A-ballots
// convert that Alice and Bob tie for last and are bulk-eliminated together.
function upperBoundBallots(): SimulationBallot[] {
  const ballots: SimulationBallot[] = [];
  for (let i = 0; i < 8; i++) {
    ballots.push(irvBallot(`voter-a${i}`, ["cand-a", "cand-b", "cand-c"]));
  }
  for (let i = 0; i < 5; i++) {
    ballots.push(irvBallot(`voter-b${i}`, ["cand-b", "cand-a", "cand-c"]));
  }
  for (let i = 0; i < 7; i++) {
    ballots.push(irvBallot(`voter-c${i}`, ["cand-c", "cand-b", "cand-a"]));
  }
  return ballots;
}

Deno.test("flip: a multi-change flip stays within its upper bound", () => {
  const ballots = upperBoundBallots();
  const result = findMinimalFlips(CANDIDATES, ballots);

  const carol = targetFor(result, "cand-c");
  assertEquals(carol.status, "flipped");
  assert(carol.k !== null && carol.k <= 3, `expected k <= 3, got ${carol.k}`);
  // No exact-k assertion: the greedy promises an upper bound, nothing more.
  assertEquals(carol.proven, false);
  assertRoundTrip(carol, ballots);

  const bob = targetFor(result, "cand-b");
  assertRoundTrip(bob, ballots);
  assertEquals(result.algorithms[0].best, "cand-b");
});

Deno.test("flip: no_flip_found does not claim the flip is impossible", () => {
  // Honesty regression (from external review of the design). Baseline:
  // A3 B2 C4 → Bob eliminated, transfers to Alice, Alice wins 5–4. A flip for
  // Carol EXISTS: rewriting the one changeable ballot C>B>A to B>A>C yields
  // 3–3–3, everyone is bulk-eliminated, and all three are co-winners. But that
  // move DEMOTES Carol on a Carol-first ballot, which the max-favorable greedy
  // never tries — so the search must answer no_flip_found, and the status must
  // be documented as "not found", never "not possible".
  const ballots = [
    irvBallot(null, ["cand-a", "cand-b", "cand-c"]),
    irvBallot(null, ["cand-a", "cand-b", "cand-c"]),
    irvBallot(null, ["cand-a", "cand-b", "cand-c"]),
    irvBallot(null, ["cand-b", "cand-a", "cand-c"]),
    irvBallot(null, ["cand-b", "cand-a", "cand-c"]),
    irvBallot(null, ["cand-c", "cand-a", "cand-b"]),
    irvBallot(null, ["cand-c", "cand-a", "cand-b"]),
    irvBallot(null, ["cand-c", "cand-b", "cand-a"]),
    irvBallot("voter-z", ["cand-c", "cand-b", "cand-a"]),
  ];

  const baseline = tabulate(["irv"], false, CANDIDATES, ballots);
  assertEquals(baseline[0].result_data.winners, ["Alice"]);

  const flipExists = tabulate(
    ["irv"],
    false,
    CANDIDATES,
    applyOverrides(ballots, [
      {
        op: "replace",
        voter_id: "voter-z",
        payload: { irv: ["cand-b", "cand-a", "cand-c"] },
      },
    ]),
  );
  assert(
    (flipExists[0].result_data.winners as string[]).includes("Carol"),
    "test premise broken: the demotion flip should exist",
  );

  const result = findMinimalFlips(CANDIDATES, ballots);
  assertEquals(targetFor(result, "cand-c").status, "no_flip_found");
});

Deno.test("flip: changes never name an orphaned ballot", () => {
  // Same profile as the honesty regression: voter-z holds the only
  // attributable ballot, so any change anywhere must name voter-z.
  const ballots = [
    irvBallot(null, ["cand-a", "cand-b", "cand-c"]),
    irvBallot(null, ["cand-a", "cand-b", "cand-c"]),
    irvBallot(null, ["cand-a", "cand-b", "cand-c"]),
    irvBallot(null, ["cand-b", "cand-a", "cand-c"]),
    irvBallot(null, ["cand-b", "cand-a", "cand-c"]),
    irvBallot(null, ["cand-c", "cand-a", "cand-b"]),
    irvBallot(null, ["cand-c", "cand-a", "cand-b"]),
    irvBallot(null, ["cand-c", "cand-b", "cand-a"]),
    irvBallot("voter-z", ["cand-c", "cand-b", "cand-a"]),
  ];
  const result = findMinimalFlips(CANDIDATES, ballots);

  for (const target of result.algorithms[0].targets) {
    for (const change of target.changes ?? []) {
      assertEquals(change.voter_id, "voter-z");
    }
  }
});

Deno.test("flip: greedy-phase exhaustion returns budget_exhausted, not a guess", () => {
  // Needs k=2, but the budget covers only the baseline plus one trial.
  const ballots = [
    irvBallot("voter-1", ["cand-a", "cand-b"]),
    irvBallot("voter-2", ["cand-a", "cand-b"]),
    irvBallot("voter-3", ["cand-a", "cand-b"]),
    irvBallot("voter-4", ["cand-a", "cand-b"]),
    irvBallot("voter-5", ["cand-b", "cand-a"]),
  ];
  const result = findMinimalFlips(CANDIDATES, ballots, { budget: 2 });

  assertEquals(result.budget_exhausted, true);
  assert(result.tabulations_used <= 2);
  for (const target of result.algorithms[0].targets) {
    assertEquals(target.status, "budget_exhausted");
    assertEquals(target.k, null);
    assertEquals(target.changes, null);
  }
});

Deno.test("flip: a flip verified before exhaustion is retained un-minimized", () => {
  // Budget 2 = baseline + the one max-favorable trial, which flips. The
  // minimization pass then has nothing left to spend, so the change ships at
  // the max-favorable payload instead of the distance-1 reduction the
  // unbudgeted run finds.
  const ballots = transferBallots();
  const result = findMinimalFlips(CANDIDATES, ballots, { budget: 2 });

  const carol = targetFor(result, "cand-c");
  assertEquals(carol.status, "flipped");
  assertEquals(carol.k, 1);
  assertEquals(carol.changes, [
    {
      voter_id: "voter-x",
      payload: { irv: ["cand-c", "cand-a", "cand-b"] },
      distance: 2,
    },
  ]);
  assertRoundTrip(carol, ballots);
  assertEquals(result.budget_exhausted, true);
});

Deno.test("flip: the time cutoff exhausts cleanly, like the count budget", () => {
  const result = findMinimalFlips(CANDIDATES, transferBallots(), {
    timeLimitMs: 0,
  });

  assertEquals(result.tabulations_used, 0);
  assertEquals(result.budget_exhausted, true);
  assertEquals(result.algorithms[0].baseline_winners, []);
  for (const target of result.algorithms[0].targets) {
    assertEquals(target.status, "budget_exhausted");
  }
});

Deno.test("flip: minimization iterates to a fixed point across sweeps", () => {
  // Found by randomized search against a single-sweep variant of the
  // minimizer. Baseline: Alice is eliminated 2-3-4 and Bob/Carol tie 4-4.
  // The greedy overshoots to a multi-ballot flip, and one sweep of the ladder
  // cannot undo it — but a second sweep, running after the first sweep's
  // reductions, shrinks the answer to a single change: voter-7's [C,B]
  // becoming [A,C,B] makes the first round 3-3-3, everyone is bulk-eliminated,
  // and Alice enters the all-way tie. A single-sweep minimizer reports k=2
  // (total distance 6) for this profile; the fixed point finds k=1.
  const rankings = [
    ["cand-b", "cand-c"],
    ["cand-c", "cand-a"],
    ["cand-a"],
    ["cand-a", "cand-b"],
    ["cand-b", "cand-c"],
    ["cand-c", "cand-b"],
    ["cand-c"],
    ["cand-c", "cand-b"],
    ["cand-b", "cand-c", "cand-a"],
  ];
  const ballots = rankings.map((irv, i) => ({
    voter_id: `voter-${i}`,
    payload: { irv },
  }));
  const result = findMinimalFlips(CANDIDATES, ballots);

  const alice = targetFor(result, "cand-a");
  assertEquals(alice.status, "flipped");
  assertEquals(alice.k, 1);
  assertEquals(alice.proven, true);
  assertEquals(alice.changes, [
    {
      voter_id: "voter-7",
      payload: { irv: ["cand-a", "cand-c", "cand-b"] },
      distance: 3,
    },
  ]);
  assertRoundTrip(alice, ballots);
});

// ---- validateFlipInputs ----

Deno.test("validateFlipInputs: requires irv and enforces both caps", () => {
  const manyBallots = Array.from(
    { length: MAX_FLIP_BALLOTS + 1 },
    (_, i) => irvBallot(`voter-${i}`, ["cand-a"]),
  );
  const manyCandidates = Array.from(
    { length: MAX_FLIP_CANDIDATES + 1 },
    (_, i) => ({ id: `cand-${i}`, name: `Candidate ${i}`, position: i }),
  );

  assertEquals(validateFlipInputs(["irv"], CANDIDATES, transferBallots()), []);
  assertEquals(validateFlipInputs(["approval", "star"], CANDIDATES, []), [
    "flip search requires an election tabulated with IRV",
  ]);
  assertEquals(validateFlipInputs(["irv"], CANDIDATES, manyBallots), [
    `too many ballots for flip search (max ${MAX_FLIP_BALLOTS})`,
  ]);
  assertEquals(validateFlipInputs(["irv"], manyCandidates, []), [
    `too many candidates for flip search (max ${MAX_FLIP_CANDIDATES})`,
  ]);

  // Exactly at the caps is fine.
  assertEquals(
    validateFlipInputs(["irv"], manyCandidates.slice(0, MAX_FLIP_CANDIDATES), [
      ...manyBallots.slice(0, MAX_FLIP_BALLOTS),
    ]),
    [],
  );
});

// ---- Purity ----

Deno.test("flip: leaves the input ballots untouched", () => {
  const ballots = upperBoundBallots();
  const snapshot = structuredClone(ballots);

  findMinimalFlips(CANDIDATES, ballots);

  assertEquals(ballots, snapshot);
});

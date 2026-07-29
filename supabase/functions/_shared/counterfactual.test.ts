// Unit tests for the counterfactual helpers (M20).
//
// Deliberately not fixture-driven: the golden corpus in `tabulate.test.ts`
// exists to lock *algorithm* behavior, and this module does not touch the
// algorithms. What needs guarding here is the substitution and validation
// rules — especially the rejections, since anything that slips through
// tabulates as a blank ballot and silently skews the simulated result.

import { assert, assertEquals, assertNotStrictEquals } from "@std/assert";
import {
  applyOverrides,
  type BallotOverride,
  diffWinners,
  MAX_OVERRIDES,
  type SimulationBallot,
  validateOverrides,
} from "./counterfactual.ts";
import { type Candidate, tabulate } from "./tabulate.ts";

const CANDIDATES: Candidate[] = [
  { id: "cand-a", name: "Alice", position: 0 },
  { id: "cand-b", name: "Bob", position: 1 },
];
const CANDIDATE_IDS = CANDIDATES.map((c) => c.id);

function ballots(): SimulationBallot[] {
  return [
    { voter_id: "voter-1", payload: { approval: ["cand-a"] } },
    { voter_id: "voter-2", payload: { approval: ["cand-a"] } },
    { voter_id: "voter-3", payload: { approval: ["cand-b"] } },
  ];
}

function noErrors(overrides: unknown, from = ballots()): void {
  assertEquals(validateOverrides(overrides, from, CANDIDATE_IDS), []);
}

function firstError(overrides: unknown, from = ballots()): string {
  const errors = validateOverrides(overrides, from, CANDIDATE_IDS);
  assert(errors.length > 0, "expected a validation error, got none");
  return errors[0];
}

// ---- applyOverrides ----

Deno.test("applyOverrides: replace swaps one ballot's payload in place", () => {
  const result = applyOverrides(ballots(), [
    { op: "replace", voter_id: "voter-1", payload: { approval: ["cand-b"] } },
  ]);

  assertEquals(result.length, 3);
  assertEquals(result[0], {
    voter_id: "voter-1",
    payload: { approval: ["cand-b"] },
  });
  assertEquals(result[1].payload, { approval: ["cand-a"] });
});

Deno.test("applyOverrides: remove drops the targeted ballot", () => {
  const result = applyOverrides(ballots(), [
    { op: "remove", voter_id: "voter-2" },
  ]);

  assertEquals(result.map((b) => b.voter_id), ["voter-1", "voter-3"]);
});

Deno.test("applyOverrides: add appends an unattributed ballot", () => {
  const result = applyOverrides(ballots(), [
    { op: "add", payload: { approval: ["cand-b"] } },
  ]);

  assertEquals(result.length, 4);
  assertEquals(result[3], { voter_id: null, payload: { approval: ["cand-b"] } });
});

Deno.test("applyOverrides: mixed ops apply together", () => {
  const overrides: BallotOverride[] = [
    { op: "replace", voter_id: "voter-1", payload: { approval: ["cand-b"] } },
    { op: "remove", voter_id: "voter-2" },
    { op: "add", payload: { approval: ["cand-b"] } },
  ];
  const result = applyOverrides(ballots(), overrides);

  assertEquals(result.map((b) => b.voter_id), ["voter-1", "voter-3", null]);
  assertEquals(
    result.map((b) => b.payload.approval),
    [["cand-b"], ["cand-b"], ["cand-b"]],
  );
});

Deno.test("applyOverrides: leaves the input array and its ballots untouched", () => {
  const original = ballots();
  const snapshot = structuredClone(original);

  const result = applyOverrides(original, [
    { op: "replace", voter_id: "voter-1", payload: { approval: ["cand-b"] } },
    { op: "remove", voter_id: "voter-2" },
    { op: "add", payload: { approval: ["cand-b"] } },
  ]);

  assertEquals(original, snapshot);
  assertNotStrictEquals(result, original);
});

Deno.test("applyOverrides: skips a target that no longer exists", () => {
  const result = applyOverrides(ballots(), [
    { op: "replace", voter_id: "voter-gone", payload: { approval: ["cand-b"] } },
  ]);

  assertEquals(result, ballots());
});

Deno.test("applyOverrides + tabulate: a single replace can flip the winner", () => {
  const baseline = tabulate(["approval"], false, CANDIDATES, ballots());
  assertEquals(baseline[0].result_data.winners, ["Alice"]);

  const simulated = tabulate(
    ["approval"],
    false,
    CANDIDATES,
    applyOverrides(ballots(), [
      { op: "replace", voter_id: "voter-1", payload: { approval: ["cand-b"] } },
      { op: "replace", voter_id: "voter-2", payload: { approval: ["cand-b"] } },
    ]),
  );

  assertEquals(simulated[0].result_data.winners, ["Bob"]);
  assertEquals(diffWinners(baseline, simulated), { approval: true });
});

// ---- Ballots from deleted accounts ----

Deno.test("a null voter_id ballot still counts but cannot be targeted", () => {
  const withDeleted: SimulationBallot[] = [
    ...ballots(),
    { voter_id: null, payload: { approval: ["cand-b"] } },
  ];

  // Counted: Alice 2, Bob 2 — the orphaned ballot produced the tie.
  const result = tabulate(["approval"], false, CANDIDATES, withDeleted);
  assertEquals(result[0].result_data.tallies, { Alice: 2, Bob: 2 });

  // Untargetable: no voter_id resolves to it.
  assertEquals(
    firstError([{ op: "remove", voter_id: "null" }], withDeleted),
    "overrides[0]: no ballot for voter_id null",
  );
});

// ---- validateOverrides: acceptance ----

Deno.test("validateOverrides: accepts well-formed overrides", () => {
  noErrors([]);
  noErrors([{ op: "remove", voter_id: "voter-1" }]);
  noErrors([
    {
      op: "replace",
      voter_id: "voter-1",
      payload: {
        approval: ["cand-a", "cand-b"],
        irv: ["cand-b", "cand-a"],
        star: { "cand-a": 0, "cand-b": 5 },
        fptp: "cand-a",
      },
    },
  ]);
  noErrors([{ op: "add", payload: {} }]);
});

// ---- validateOverrides: rejection ----

Deno.test("validateOverrides: rejects a non-array", () => {
  assertEquals(validateOverrides({}, ballots(), CANDIDATE_IDS), [
    "overrides must be an array",
  ]);
});

Deno.test("validateOverrides: rejects more than MAX_OVERRIDES", () => {
  const many = Array.from({ length: MAX_OVERRIDES + 1 }, () => ({
    op: "add",
    payload: {},
  }));

  assertEquals(firstError(many), `too many overrides (max ${MAX_OVERRIDES})`);
});

Deno.test("validateOverrides: rejects an unknown op", () => {
  assertEquals(
    firstError([{ op: "delete", voter_id: "voter-1" }]),
    'overrides[0]: unknown op "delete"',
  );
});

Deno.test("validateOverrides: rejects a non-object entry", () => {
  assertEquals(firstError(["replace"]), "overrides[0]: must be an object");
});

Deno.test("validateOverrides: rejects a missing voter_id", () => {
  assertEquals(
    firstError([{ op: "replace", payload: {} }]),
    "overrides[0]: replace requires a voter_id",
  );
});

Deno.test("validateOverrides: rejects an unknown voter_id", () => {
  assertEquals(
    firstError([{ op: "remove", voter_id: "voter-9" }]),
    "overrides[0]: no ballot for voter_id voter-9",
  );
});

Deno.test("validateOverrides: rejects two overrides targeting one voter", () => {
  assertEquals(
    firstError([
      { op: "replace", voter_id: "voter-1", payload: {} },
      { op: "remove", voter_id: "voter-1" },
    ]),
    "overrides[1]: voter_id voter-1 is targeted by more than one override",
  );
});

Deno.test("validateOverrides: rejects a non-object payload", () => {
  assertEquals(
    firstError([{ op: "add", payload: [] }]),
    "overrides[0]: payload must be an object",
  );
});

Deno.test("validateOverrides: rejects a misspelled payload key", () => {
  const error = firstError([{ op: "add", payload: { aproval: ["cand-a"] } }]);
  assert(
    error.includes('unknown payload key "aproval"'),
    `unexpected error: ${error}`,
  );
});

Deno.test("validateOverrides: rejects a candidate from another election", () => {
  for (const payload of [
    { approval: ["cand-z"] },
    { irv: ["cand-z"] },
    { star: { "cand-z": 3 } },
    { fptp: "cand-z" },
  ]) {
    const error = firstError([{ op: "add", payload }]);
    assert(
      error.includes("not a candidate in this election"),
      `unexpected error for ${JSON.stringify(payload)}: ${error}`,
    );
  }
});

Deno.test("validateOverrides: rejects duplicates within a list", () => {
  assertEquals(
    firstError([{ op: "add", payload: { irv: ["cand-a", "cand-a"] } }]),
    "overrides[0]: payload.irv lists cand-a more than once",
  );
});

Deno.test("validateOverrides: rejects out-of-range and non-integer star scores", () => {
  for (const score of [-1, 6, 2.5, "3", null]) {
    const error = firstError([
      { op: "add", payload: { star: { "cand-a": score } } },
    ]);
    assert(
      error.includes("must be an integer 0–5"),
      `unexpected error for score ${JSON.stringify(score)}: ${error}`,
    );
  }
});

Deno.test("validateOverrides: reports every problem, not just the first", () => {
  const errors = validateOverrides(
    [
      { op: "nope" },
      { op: "remove", voter_id: "voter-9" },
      { op: "add", payload: { fptp: "cand-z" } },
    ],
    ballots(),
    CANDIDATE_IDS,
  );

  assertEquals(errors.length, 3);
});

// ---- diffWinners ----

Deno.test("diffWinners: false when the outcome is unchanged", () => {
  const baseline = tabulate(["approval"], false, CANDIDATES, ballots());
  const simulated = tabulate(
    ["approval"],
    false,
    CANDIDATES,
    // Dropping Bob's only vote widens Alice's margin without changing who won.
    applyOverrides(ballots(), [{ op: "remove", voter_id: "voter-3" }]),
  );

  assertEquals(diffWinners(baseline, simulated), { approval: false });
});

Deno.test("diffWinners: true when a win becomes a tie", () => {
  const baseline = tabulate(["approval"], false, CANDIDATES, ballots());
  const simulated = tabulate(
    ["approval"],
    false,
    CANDIDATES,
    applyOverrides(ballots(), [
      { op: "add", payload: { approval: ["cand-b"] } },
    ]),
  );

  assertEquals(baseline[0].result_data.winners, ["Alice"]);
  assertEquals(simulated[0].result_data.winners, ["Alice", "Bob"]);
  assertEquals(diffWinners(baseline, simulated), { approval: true });
});

Deno.test("diffWinners: reports each algorithm independently", () => {
  const algorithms = ["approval", "irv"];
  const starting: SimulationBallot[] = [
    { voter_id: "voter-1", payload: { approval: ["cand-a"], irv: ["cand-a"] } },
    { voter_id: "voter-2", payload: { approval: ["cand-a"], irv: ["cand-b"] } },
    { voter_id: "voter-3", payload: { approval: ["cand-b"], irv: ["cand-b"] } },
  ];

  const baseline = tabulate(algorithms, false, CANDIDATES, starting);
  const simulated = tabulate(
    algorithms,
    false,
    CANDIDATES,
    // Moves voter-2's approval to Bob while leaving their IRV ranking alone:
    // approval flips Alice → Bob, IRV was already Bob.
    applyOverrides(starting, [
      {
        op: "replace",
        voter_id: "voter-2",
        payload: { approval: ["cand-b"], irv: ["cand-b"] },
      },
    ]),
  );

  assertEquals(diffWinners(baseline, simulated), {
    approval: true,
    irv: false,
  });
});

Deno.test("diffWinners: true when an algorithm is missing from the simulation", () => {
  const baseline = tabulate(["approval"], false, CANDIDATES, ballots());

  assertEquals(diffWinners(baseline, []), { approval: true });
});

// Guards the positional comparison: same winners, different order, is a change,
// because `result_data.winner` is `winners[0]`.
Deno.test("diffWinners: winner order is significant", () => {
  assertEquals(
    diffWinners(
      [{ algorithm: "approval", result_data: { winners: ["Alice", "Bob"] } }],
      [{ algorithm: "approval", result_data: { winners: ["Bob", "Alice"] } }],
    ),
    { approval: true },
  );
});

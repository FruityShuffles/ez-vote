// Case Study fixtures: structure and lesson (#141).
//
// These run in `deno task test` alongside the golden corpora, and for the same
// reason. A case study is a published claim — "promote this candidate on two
// ballots and the winner changes" — made in the election's own description. If
// `tabulate()` ever drifts, the claim silently becomes a lie on a page we point
// newcomers at. This suite makes that drift a red build instead.
//
// Everything here is offline: the seeding half is `seed-case-studies.ts`.

import { assert, assertEquals } from "@std/assert";
import { tabulate } from "../_shared/tabulate.ts";
import {
  applyOverrides,
  type BallotOverride,
} from "../_shared/counterfactual.ts";
import { findMinimalFlips } from "../_shared/flip.ts";
import { findStrategicOpportunities } from "../_shared/strategy.ts";
import {
  ballotRows,
  candidateIdsFor,
  disagreeingAlgorithms,
  candidateRows,
  type CaseStudyFixture,
  electionIdFor,
  loadFixtures,
  resolvePayload,
  uuidV5,
  validateFixture,
  voterEmailFor,
  type WinnersByAlgorithm,
} from "./case-study-fixture.ts";

// loadFixtures() throws on a structurally invalid fixture, so reaching this
// line is itself the structural assertion for every file in the directory.
const fixtures = await loadFixtures();

/// Voter identity for offline tabulation. Any stable non-null string works —
/// the flip search only requires that ballots be attributable.
function voterIds(fixture: CaseStudyFixture): Map<string, string> {
  return new Map(fixture.voters.map((v) => [v.name, v.name]));
}

/// Winners of **every** algorithm the fixture is tabulated with. A case study
/// whose lesson is a disagreement between methods makes a claim about all of
/// them at once, so nothing here may narrow to `results[0]`.
function winnersByAlgorithm(
  fixture: CaseStudyFixture,
  candidates: ReturnType<typeof candidateRows>,
  ballots: ReturnType<typeof ballotRows>,
): WinnersByAlgorithm {
  const results = tabulate(
    fixture.algorithms,
    fixture.include_fptp,
    candidates,
    ballots,
  );
  return Object.fromEntries(
    results.map((r) => [r.algorithm, r.result_data.winners as string[]]),
  );
}

Deno.test("at least one case study exists", () => {
  assert(fixtures.length > 0, "no case study fixtures found");
});

Deno.test("uuid-v5 matches the RFC 4122 test vectors", async () => {
  // Every seeded id derives from this, so it is pinned to vectors computed
  // outside this codebase rather than to its own output.
  const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  assertEquals(
    await uuidV5(DNS, "www.example.com"),
    "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  );
  assertEquals(
    await uuidV5(DNS, "example.com"),
    "cfbff0d1-9375-5685-968c-48ce8b15ae17",
  );
});

for (const fixture of fixtures) {
  const ids = await candidateIdsFor(fixture);
  const candidates = candidateRows(fixture, ids);
  const ballots = ballotRows(fixture, ids, voterIds(fixture));

  Deno.test(`${fixture.slug}: baseline produces the documented winner`, () => {
    assertEquals(
      winnersByAlgorithm(fixture, candidates, ballots),
      fixture.lesson.baseline_winners,
    );
  });

  Deno.test(`${fixture.slug}: the lesson's changes flip the outcome`, () => {
    // Shaped exactly like the overrides the explorer sends, so a passing test
    // means the documented exercise is reproducible in the live UI.
    const overrides: BallotOverride[] = fixture.lesson.changes.map((
      change,
    ) => ({
      op: "replace",
      voter_id: change.voter,
      payload: resolvePayload(change.payload, ids),
    }));
    const simulated = applyOverrides(ballots, overrides);

    assertEquals(
      simulated.length,
      ballots.length,
      "overrides must not add or drop ballots",
    );
    assertEquals(
      winnersByAlgorithm(fixture, candidates, simulated),
      fixture.lesson.expected_winners,
    );
    assert(
      disagreeingAlgorithms(
        fixture.lesson.baseline_winners,
        fixture.lesson.expected_winners,
      ).length > 0,
      "the lesson's changes must actually change some method's outcome",
    );
  });

  Deno.test(`${fixture.slug}: every ballot is attributable`, () => {
    // Overrides key on voter_id and the flip search skips null-voter ballots,
    // so an unattributable ballot would be invisible to the explorer.
    assert(ballots.every((b) => b.voter_id !== null));
    assertEquals(new Set(ballots.map((b) => b.voter_id)).size, ballots.length);
  });

  if (fixture.algorithms.includes("irv")) {
    Deno.test(`${fixture.slug}: the flip search finds a flip for every loser`, () => {
      const search = findMinimalFlips(candidates, ballots);
      const irv = search.algorithms[0];
      assert(!search.budget_exhausted, "flip search ran out of budget");
      assertEquals(irv.baseline_winners, fixture.lesson.baseline_winners.irv);
      assert(irv.targets.length > 0, "no flip targets");
      for (const target of irv.targets) {
        assertEquals(
          target.status,
          "flipped",
          `${target.candidate_name}: ${target.status}`,
        );
      }
    });

    Deno.test(`${fixture.slug}: the stored flip search is deterministic`, () => {
      // The seed script writes this answer into `flip_searches` (#146) through
      // its read-diff-write chain, so a second run must produce byte-identical
      // JSON or it would churn the row and break the script's no-op invariant.
      // `timeLimitMs: Infinity` is what buys that: findMinimalFlips is also
      // bounded by a wall-clock deadline, so with the default the answer would
      // depend on how busy the machine was.
      const limits = { timeLimitMs: Number.POSITIVE_INFINITY };
      assertEquals(
        JSON.stringify(findMinimalFlips(candidates, ballots, limits)),
        JSON.stringify(findMinimalFlips(candidates, ballots, limits)),
      );
    });

    Deno.test(`${fixture.slug}: every flip change names a real ballot`, () => {
      // The explorer keys `originals`, the voter-name lookup and
      // applied-suggestion matching on FlipChange.voter_id. A stored answer
      // carrying anything other than a real ballot's voter_id renders as
      // "Unnamed voter" and can never be applied — which is exactly what
      // seeding from the display-name map would produce.
      const attributable = new Set(ballots.map((b) => b.voter_id));
      const search = findMinimalFlips(candidates, ballots, {
        timeLimitMs: Number.POSITIVE_INFINITY,
      });
      for (const target of search.algorithms[0].targets) {
        for (const change of target.changes ?? []) {
          assert(
            attributable.has(change.voter_id),
            `${target.candidate_name}: unknown voter_id ${change.voter_id}`,
          );
        }
      }
    });
  }

  Deno.test(`${fixture.slug}: the stored strategic search is deterministic and real`, () => {
    // The seed script writes this into `flip_searches.strategy` (#149) through
    // the same read-diff-write chain as the flip answer, so it carries the same
    // two obligations: byte-identical JSON on a re-run, or the row churns and
    // the script's no-op invariant breaks; and real ballot voter_ids, or the
    // panel renders "Unnamed voter" and nothing can be applied.
    const limits = { timeLimitMs: Number.POSITIVE_INFINITY };
    const search = findStrategicOpportunities(
      fixture.algorithms,
      fixture.include_fptp,
      candidates,
      ballots,
      limits,
    );
    assertEquals(
      JSON.stringify(search),
      JSON.stringify(
        findStrategicOpportunities(
          fixture.algorithms,
          fixture.include_fptp,
          candidates,
          ballots,
          limits,
        ),
      ),
    );

    const attributable = new Set(ballots.map((b) => b.voter_id));
    for (const opportunity of search.opportunities) {
      assert(
        attributable.has(opportunity.voter_id),
        `unknown voter_id ${opportunity.voter_id}`,
      );
    }
  });

  Deno.test(`${fixture.slug}: derived identities are stable`, async () => {
    // Pins the ids the seed script upserts by. A change here means a re-seed
    // would orphan the live election rather than update them, so it must be a
    // deliberate edit, never a refactoring accident.
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assertEquals(
      await electionIdFor(fixture.slug),
      await electionIdFor(fixture.slug),
    );
    assert(uuid.test(await electionIdFor(fixture.slug)));
    for (const id of ids.values()) assert(uuid.test(id));
    assertEquals(new Set(ids.values()).size, fixture.candidates.length);
    for (const voter of fixture.voters) {
      assert(
        voterEmailFor(fixture.slug, voter.name).endsWith(
          "@case-studies.invalid",
        ),
      );
    }
    assertEquals(
      new Set(fixture.voters.map((v) => voterEmailFor(fixture.slug, v.name)))
        .size,
      fixture.voters.length,
      "voter names must produce distinct emails",
    );
  });
}

Deno.test("validateFixture rejects a broken fixture", () => {
  assert(validateFixture(null).length > 0);
  assert(validateFixture({}).length > 0);
  // A ballot naming a candidate the fixture never declared would tabulate as a
  // blank ballot and quietly skew the lesson.
  const errors = validateFixture({
    slug: "x",
    title: "t",
    description: "d",
    algorithms: ["irv"],
    include_fptp: false,
    candidates: ["A", "B"],
    voters: [{ name: "V", payload: { irv: ["A", "Nope"] } }],
    lesson: {
      summary: "s",
      baseline_winners: { irv: ["A"] },
      changes: [{ voter: "V", payload: { irv: ["B", "A"] } }],
      expected_winners: { irv: ["B"] },
    },
  });
  assertEquals(errors.length, 1);
  assert(errors[0].includes("Nope"), errors[0]);
});

Deno.test("validateFixture requires a winner for every tabulated algorithm", () => {
  // Partial coverage is the failure mode this rule exists for: an FPTP-bearing
  // fixture that declares only its ranked methods would publish an FPTP result
  // no test ever looked at — on a page whose entire lesson is about FPTP.
  const base = {
    slug: "x",
    title: "t",
    description: "d",
    algorithms: ["irv"],
    include_fptp: true,
    candidates: ["A", "B"],
    voters: [{ name: "V", payload: { irv: ["A", "B"] } }],
    changes: [{ voter: "V", payload: { irv: ["B", "A"] } }],
  };

  const missing = validateFixture({
    ...base,
    lesson: {
      summary: "s",
      baseline_winners: { irv: ["A"] },
      changes: base.changes,
      expected_winners: { irv: ["B"], fptp: ["B"] },
    },
  });
  assertEquals(missing.length, 1);
  assert(missing[0].includes("baseline_winners is missing fptp"), missing[0]);

  const extra = validateFixture({
    ...base,
    include_fptp: false,
    lesson: {
      summary: "s",
      baseline_winners: { irv: ["A"], star: ["A"] },
      changes: base.changes,
      expected_winners: { irv: ["B"] },
    },
  });
  assertEquals(extra.length, 1);
  assert(extra[0].includes("not tabulated by this fixture"), extra[0]);
});

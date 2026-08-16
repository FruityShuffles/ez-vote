// Seed the curated public "Case Studies" elections (#141, part of #139).
//
// A case study is a completed, publicly viewable election that teaches one
// voting-theory lesson — see docs/Features/Case Studies.md. Migration 022 made
// such elections possible but deliberately unreachable from the app: the owner
// INSERT/UPDATE policies require `visibility = 'private' and showcase = false`,
// so the service role is the only writer. This script is that writer.
//
// IDEMPOTENT BY CONSTRUCTION, in two layers:
//   1. Ids are derived from the fixture slug (deterministic UUIDv5), so a
//      re-run addresses the same election, candidates and accounts rather than
//      creating a second copy.
//   2. Every step reads current state first and writes only real differences.
//      That is not just tidiness: `ballots` has a bump_ballots_updated_at
//      trigger and inserting a candidate bumps elections.candidates_updated_at,
//      so a blind upsert would churn timestamps the UI shows and the realtime
//      polling reacts to. A second run must be a genuine no-op.
//
// Adding a case study = drop a JSON fixture in scripts/case-studies/ and re-run.
//
// Usage (from supabase/functions/):
//   deno task seed-case-studies
//   deno task seed-case-studies -- --dry-run          # report, write nothing
//   deno task seed-case-studies -- --only=<slug>
//   deno task seed-case-studies -- --help
//
// Requires the SERVICE ROLE key in SUPABASE_SERVICE_ROLE_KEY: it bypasses RLS and
// reaches the auth admin API to mint the placeholder voters. Never put it on a
// command line, in .env, or in a commit — on Windows,
// `. .\tools\Set-SupabaseEnv.ps1` supplies it from Credential Manager.
// See docs/Backend/Service-Role Scripts.md.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tabulate } from "../_shared/tabulate.ts";
import {
  applyOverrides,
  type BallotOverride,
} from "../_shared/counterfactual.ts";
import { findMinimalFlips, validateFlipInputs } from "../_shared/flip.ts";
import {
  ballotRows,
  candidateIdsFor,
  candidateRows,
  type CaseStudyFixture,
  disagreeingAlgorithms,
  electionIdFor,
  loadFixtures,
  resolvePayload,
  voterEmailFor,
  type WinnersByAlgorithm,
} from "./case-study-fixture.ts";

const HELP = `seed-case-studies — create/refresh the public Case Study elections

Flags:
  --dry-run       Report what would change; write nothing.
  --only=<slug>   Seed a single fixture.
  --help          Show this help.

Environment:
  SUPABASE_URL                 Project URL (e.g. https://xxxx.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY    Service-role key. Never pass it on a command line
                               or store it in .env. On Windows, dot-source
                               tools/Set-SupabaseEnv.ps1 first — it supplies both
                               from Windows Credential Manager.
                               See docs/Backend/Service-Role Scripts.md.

Fixtures:
  scripts/case-studies/*.json  — see docs/Features/Case Studies.md
`;

// The single account that owns every case study. Its display name is what a
// visitor sees as the election's organiser.
const OWNER_EMAIL = "owner@case-studies.invalid";
const OWNER_DISPLAY_NAME = "EZVote Case Studies";

// ~100 years. Placeholder accounts are already unreachable (unroutable
// `.invalid` domain, random password never persisted), so this is belt and
// braces: a banned user cannot authenticate even if both of those were undone.
const BAN_DURATION = "876000h";

// ---- Change reporting ----------------------------------------------------
// The script's own output is the evidence for "re-running changes nothing", so
// every write path routes through here and a clean run prints zero of the first
// three counters.

class Report {
  created = 0;
  updated = 0;
  deleted = 0;
  unchanged = 0;
  private lines: string[] = [];

  create(what: string) {
    this.created++;
    this.lines.push(`  + ${what}`);
  }
  update(what: string) {
    this.updated++;
    this.lines.push(`  ~ ${what}`);
  }
  remove(what: string) {
    this.deleted++;
    this.lines.push(`  - ${what}`);
  }
  same(_what: string) {
    this.unchanged++;
  }
  note(what: string) {
    this.lines.push(`    ${what}`);
  }

  get changes(): number {
    return this.created + this.updated + this.deleted;
  }

  print() {
    for (const line of this.lines) console.log(line);
    console.log(
      `  = ${this.created} created, ${this.updated} updated, ` +
        `${this.deleted} deleted, ${this.unchanged} unchanged`,
    );
  }
}

// ---- Small helpers -------------------------------------------------------

/// Key-order-insensitive comparison, so a re-read row whose JSONB keys came back
/// in a different order does not read as a change. Array order stays
/// significant — it carries the IRV ranking.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/// Fields of `desired` that differ from `existing`, so an UPDATE touches only
/// what actually moved.
function changedFields(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>,
): string[] {
  return Object.keys(desired).filter(
    (key) => stableStringify(existing[key]) !== stableStringify(desired[key]),
  );
}

function pick(
  source: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)) + "aA1!";
}

function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

// ---- Accounts ------------------------------------------------------------

/// Paged fallback for the case where an auth user exists but its profile row
/// does not (a trigger that failed once). Only reached after createUser reports
/// a duplicate, so the cost is paid at most once per broken account.
async function findAuthUserByEmail(
  sb: SupabaseClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    if (!data.users.length) return null;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
  }
  return null;
}

/// Returns the profile id for a placeholder account, creating it if needed.
/// `null` means dry-run and the account does not exist yet — callers report
/// downstream rows as creates rather than diffing them.
async function ensureAccount(
  sb: SupabaseClient,
  email: string,
  displayName: string,
  report: Report,
  dryRun: boolean,
): Promise<string | null> {
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, display_name")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`profiles lookup for ${email}: ${error.message}`);

  if (profile) {
    if (profile.display_name !== displayName) {
      report.update(`account ${email} display_name → ${displayName}`);
      if (!dryRun) {
        const { error: updateError } = await sb
          .from("profiles")
          .update({ display_name: displayName })
          .eq("id", profile.id);
        if (updateError) throw new Error(updateError.message);
      }
    } else {
      report.same(`account ${email}`);
    }
    return profile.id as string;
  }

  report.create(`account ${email} (${displayName})`);
  if (dryRun) return null;

  let userId: string;
  const { data: created, error: createError } = await sb.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !created?.user) {
    const recovered = await findAuthUserByEmail(sb, email);
    if (!recovered) {
      throw new Error(
        `could not create ${email}: ${
          createError?.message ?? "no user returned"
        }`,
      );
    }
    userId = recovered;
  } else {
    userId = created.user.id;
  }

  // Repair: handle_new_user() normally makes this row from the INSERT trigger,
  // but the account is useless without it, so never assume.
  const { error: profileError } = await sb
    .from("profiles")
    .upsert({ id: userId, email, display_name: displayName }, {
      onConflict: "id",
    });
  if (profileError) {
    throw new Error(`profile for ${email}: ${profileError.message}`);
  }

  const { error: banError } = await sb.auth.admin.updateUserById(userId, {
    ban_duration: BAN_DURATION,
  });
  if (banError) {
    report.note(`warning: could not ban ${email} — ${banError.message}`);
  }

  return userId;
}

// ---- Per-fixture seeding -------------------------------------------------

/// Names the algorithm that disagreed, not just the winner — with four
/// tabulations in play, "winner is X, fixture claims Y" is not enough to find
/// the drift.
function assertLesson(
  what: string,
  actual: WinnersByAlgorithm,
  claimed: WinnersByAlgorithm,
): void {
  const drifted = disagreeingAlgorithms(actual, claimed);
  if (drifted.length === 0) return;
  const detail = drifted
    .map((algorithm) =>
      `${algorithm} produces "${(actual[algorithm] ?? []).join(", ")}", ` +
      `fixture claims "${(claimed[algorithm] ?? []).join(", ")}"`
    )
    .join("; ");
  throw new Error(`lesson mismatch: under ${what}, ${detail}`);
}

async function seedFixture(
  sb: SupabaseClient,
  fixture: CaseStudyFixture,
  dryRun: boolean,
): Promise<Report> {
  const report = new Report();
  const electionId = await electionIdFor(fixture.slug);
  const candidateIds = await candidateIdsFor(fixture);
  const candidates = candidateRows(fixture, candidateIds);

  // --- Lesson gate, before a single write ---------------------------------
  // The claim in the election's own description is checked against the real
  // tabulator here as well as in the unit tests, because this is the last point
  // before it becomes a published page.
  const names = new Map(fixture.voters.map((v) => [v.name, v.name]));
  const checkBallots = ballotRows(fixture, candidateIds, names);
  // Every algorithm, never just the first: a case study whose lesson is a
  // disagreement between methods claims something about all of them at once.
  const winners = (ballots: typeof checkBallots): WinnersByAlgorithm =>
    Object.fromEntries(
      tabulate(fixture.algorithms, fixture.include_fptp, candidates, ballots)
        .map((r) => [r.algorithm, r.result_data.winners as string[]]),
    );
  const lessonOverrides: BallotOverride[] = fixture.lesson.changes.map((c) => ({
    op: "replace",
    voter_id: c.voter,
    payload: resolvePayload(c.payload, candidateIds),
  }));
  assertLesson(
    "baseline",
    winners(checkBallots),
    fixture.lesson.baseline_winners,
  );
  assertLesson(
    "the documented changes",
    winners(applyOverrides(checkBallots, lessonOverrides)),
    fixture.lesson.expected_winners,
  );

  // --- Accounts -----------------------------------------------------------
  const ownerId = await ensureAccount(
    sb,
    OWNER_EMAIL,
    OWNER_DISPLAY_NAME,
    report,
    dryRun,
  );
  const voterIds = new Map<string, string | null>();
  for (const voter of fixture.voters) {
    voterIds.set(
      voter.name,
      await ensureAccount(
        sb,
        voterEmailFor(fixture.slug, voter.name),
        voter.name,
        report,
        dryRun,
      ),
    );
  }

  // --- Election -----------------------------------------------------------
  // `public_ballots` is what makes the counterfactual explorer eligible;
  // `visibility` opens it to anonymous readers and exempts it from the 60-day
  // purge; `showcase` puts it in the curated Case Studies list.
  const desiredElection: Record<string, unknown> = {
    owner_id: ownerId,
    title: fixture.title,
    description: fixture.description,
    status: "closed",
    algorithms: fixture.algorithms,
    include_fptp: fixture.include_fptp,
    public_ballots: true,
    visibility: "public",
    showcase: true,
    invite_mode: "open",
    allow_voter_candidates: false,
    realtime_results: false,
  };
  const electionColumns = Object.keys(desiredElection);
  const { data: electionRow, error: electionReadError } = await sb
    .from("elections")
    .select(["id", ...electionColumns].join(", "))
    .eq("id", electionId)
    .maybeSingle();
  if (electionReadError) throw new Error(electionReadError.message);
  // The column list is built from `desiredElection`, so supabase-js cannot infer
  // a row shape for it.
  const existingElection = electionRow as unknown as
    | Record<string, unknown>
    | null;

  if (!existingElection) {
    report.create(`election ${electionId} "${fixture.title}"`);
    if (!dryRun) {
      const { error } = await sb
        .from("elections")
        .insert({ id: electionId, ...desiredElection });
      if (error) throw new Error(`election insert: ${error.message}`);
    }
  } else {
    const changed = changedFields(existingElection, desiredElection);
    if (changed.length > 0) {
      report.update(`election ${electionId} (${changed.join(", ")})`);
      if (!dryRun) {
        const { error } = await sb
          .from("elections")
          .update(pick(desiredElection, changed))
          .eq("id", electionId);
        if (error) throw new Error(`election update: ${error.message}`);
      }
    } else {
      report.same("election");
    }
  }

  // --- Candidates ---------------------------------------------------------
  const { data: existingCandidates, error: candidateReadError } = await sb
    .from("candidates")
    .select("id, name, position")
    .eq("election_id", electionId);
  if (candidateReadError) throw new Error(candidateReadError.message);

  const candidateById = new Map(
    (existingCandidates ?? []).map((c) => [c.id as string, c]),
  );
  for (const candidate of candidates) {
    const existing = candidateById.get(candidate.id);
    const desired = { name: candidate.name, position: candidate.position };
    if (!existing) {
      report.create(`candidate ${candidate.name}`);
      if (!dryRun) {
        const { error } = await sb
          .from("candidates")
          .insert({ id: candidate.id, election_id: electionId, ...desired });
        if (error) {
          throw new Error(`candidate ${candidate.name}: ${error.message}`);
        }
      }
    } else if (
      changedFields(existing as Record<string, unknown>, desired).length > 0
    ) {
      report.update(`candidate ${candidate.name}`);
      if (!dryRun) {
        const { error } = await sb
          .from("candidates")
          .update(desired)
          .eq("id", candidate.id);
        if (error) {
          throw new Error(`candidate ${candidate.name}: ${error.message}`);
        }
      }
    } else {
      report.same(`candidate ${candidate.name}`);
    }
  }

  // Prune: scoped to this election only, so the fixture is the whole truth
  // about it. Nothing outside a seeded case study is ever deleted.
  const wantedCandidateIds = new Set(candidates.map((c) => c.id));
  const staleCandidates = (existingCandidates ?? []).filter(
    (c) => !wantedCandidateIds.has(c.id as string),
  );
  for (const stale of staleCandidates) {
    report.remove(`candidate ${stale.name} (not in fixture)`);
  }
  if (staleCandidates.length > 0 && !dryRun) {
    const { error } = await sb
      .from("candidates")
      .delete()
      .in("id", staleCandidates.map((c) => c.id));
    if (error) throw new Error(`candidate prune: ${error.message}`);
  }

  // --- Membership ---------------------------------------------------------
  // Every ballot belongs to a joined voter, exactly as the real join flow
  // leaves it. Column is `user_id`, not `voter_id` (migration 005).
  const knownVoterIds = [...voterIds.values()].filter(
    (id): id is string => id !== null,
  );
  const { data: existingMembers, error: memberReadError } = await sb
    .from("election_voters")
    .select("user_id")
    .eq("election_id", electionId);
  if (memberReadError) throw new Error(memberReadError.message);

  const memberIds = new Set(
    (existingMembers ?? []).map((m) => m.user_id as string),
  );
  const missingMembers = knownVoterIds.filter((id) => !memberIds.has(id));
  const newVoterCount = [...voterIds.values()].filter((id) => id === null)
    .length;
  if (missingMembers.length + newVoterCount > 0) {
    report.create(
      `${missingMembers.length + newVoterCount} election_voters row(s)`,
    );
    if (!dryRun && missingMembers.length > 0) {
      const { error } = await sb.from("election_voters").insert(
        missingMembers.map((id) => ({ election_id: electionId, user_id: id })),
      );
      if (error) throw new Error(`election_voters: ${error.message}`);
    }
  } else {
    report.same("election_voters");
  }

  const wantedVoterIds = new Set(knownVoterIds);
  const staleMembers = [...memberIds].filter((id) => !wantedVoterIds.has(id));
  if (staleMembers.length > 0) {
    report.remove(`${staleMembers.length} election_voters row(s)`);
    if (!dryRun) {
      const { error } = await sb
        .from("election_voters")
        .delete()
        .eq("election_id", electionId)
        .in("user_id", staleMembers);
      if (error) throw new Error(`election_voters prune: ${error.message}`);
    }
  }

  // --- Ballots ------------------------------------------------------------
  const { data: existingBallots, error: ballotReadError } = await sb
    .from("ballots")
    .select("id, voter_id, payload")
    .eq("election_id", electionId);
  if (ballotReadError) throw new Error(ballotReadError.message);

  const ballotByVoter = new Map(
    (existingBallots ?? [])
      .filter((b) => b.voter_id !== null)
      .map((b) => [b.voter_id as string, b]),
  );
  for (const voter of fixture.voters) {
    const voterId = voterIds.get(voter.name) ?? null;
    const payload = resolvePayload(voter.payload, candidateIds);
    if (voterId === null) {
      report.create(`ballot for ${voter.name}`);
      continue;
    }
    const existing = ballotByVoter.get(voterId);
    if (!existing) {
      report.create(`ballot for ${voter.name}`);
      if (!dryRun) {
        const { error } = await sb
          .from("ballots")
          .insert({ election_id: electionId, voter_id: voterId, payload });
        if (error) throw new Error(`ballot ${voter.name}: ${error.message}`);
      }
    } else if (stableStringify(existing.payload) !== stableStringify(payload)) {
      report.update(`ballot for ${voter.name}`);
      if (!dryRun) {
        const { error } = await sb
          .from("ballots")
          .update({ payload })
          .eq("id", existing.id);
        if (error) throw new Error(`ballot ${voter.name}: ${error.message}`);
      }
    } else {
      report.same(`ballot for ${voter.name}`);
    }
  }

  // A ballot whose voter left the fixture would still count toward every tally
  // — and a null-voter one could not even be targeted by an override.
  const staleBallots = (existingBallots ?? []).filter(
    (b) => b.voter_id === null || !wantedVoterIds.has(b.voter_id as string),
  );
  if (staleBallots.length > 0) {
    report.remove(`${staleBallots.length} ballot(s) not in fixture`);
    if (!dryRun) {
      const { error } = await sb
        .from("ballots")
        .delete()
        .in("id", staleBallots.map((b) => b.id));
      if (error) throw new Error(`ballot prune: ${error.message}`);
    }
  }

  // --- Results ------------------------------------------------------------
  // Same code path production results take: the shared tabulate() helper, not a
  // call out to compute-results.
  const finalBallots = ballotRows(fixture, candidateIds, names);
  const results = tabulate(
    fixture.algorithms,
    fixture.include_fptp,
    candidates,
    finalBallots,
  );
  const { data: existingResults, error: resultReadError } = await sb
    .from("results")
    .select("id, algorithm, result_data")
    .eq("election_id", electionId);
  if (resultReadError) throw new Error(resultReadError.message);

  const resultByAlgorithm = new Map(
    (existingResults ?? []).map((r) => [r.algorithm as string, r]),
  );
  for (const result of results) {
    const existing = resultByAlgorithm.get(result.algorithm);
    if (!existing) {
      report.create(`results/${result.algorithm}`);
      if (!dryRun) {
        const { error } = await sb.from("results").insert({
          election_id: electionId,
          algorithm: result.algorithm,
          result_data: result.result_data,
        });
        if (error) {
          throw new Error(`results ${result.algorithm}: ${error.message}`);
        }
      }
    } else if (
      stableStringify(existing.result_data) !==
        stableStringify(result.result_data)
    ) {
      report.update(`results/${result.algorithm}`);
      if (!dryRun) {
        const { error } = await sb
          .from("results")
          .update({ result_data: result.result_data })
          .eq("id", existing.id);
        if (error) {
          throw new Error(`results ${result.algorithm}: ${error.message}`);
        }
      }
    } else {
      report.same(`results/${result.algorithm}`);
    }
  }

  const wantedAlgorithms = new Set(results.map((r) => r.algorithm));
  const staleResults = (existingResults ?? []).filter(
    (r) => !wantedAlgorithms.has(r.algorithm as string),
  );
  for (const stale of staleResults) {
    report.remove(`results/${stale.algorithm} (not in fixture)`);
  }
  if (staleResults.length > 0 && !dryRun) {
    const { error } = await sb
      .from("results")
      .delete()
      .in("id", staleResults.map((r) => r.id));
    if (error) throw new Error(`results prune: ${error.message}`);
  }

  // --- Flip search --------------------------------------------------------
  // Case studies never pass through compute-results — they are inserted already
  // `closed` — so this script is the writer for their precomputed flip search
  // (#146), exactly as it is for their `results`.
  //
  // Two details are load-bearing:
  //
  //   * REAL profile uuids, not the display names `names` carries for the
  //     lesson gate. `FlipChange.voter_id` is what the explorer keys ballots,
  //     chips and applied-suggestion matching on, so names here would render
  //     every suggestion as "Unnamed voter" and no "Try these changes" would
  //     ever apply. tabulate() ignores voter_id, which is why the results step
  //     above can get away with the name map and this one cannot.
  //
  //   * `timeLimitMs: Infinity`. findMinimalFlips is bounded by a wall-clock
  //     deadline as well as a tabulation count, so with the default the stored
  //     answer would depend on how busy the machine was and a re-run could
  //     churn the row — breaking the no-op invariant this whole script is built
  //     around. With only the count budget it is a pure function of the
  //     fixture. Case studies are tiny; the budget is never approached.
  const seededVoterIds = new Map(
    [...voterIds.entries()].filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  const flipBallots = ballotRows(fixture, candidateIds, seededVoterIds);
  const flipEligible =
    validateFlipInputs(fixture.algorithms, candidates, flipBallots).length ===
      0;
  // In a dry run the placeholder accounts may not exist yet, so there are no
  // uuids to key the search on. Report the intent and write nothing.
  const votersReady = seededVoterIds.size === fixture.voters.length;
  const desiredFlip = flipEligible && votersReady
    ? findMinimalFlips(candidates, flipBallots, {
      timeLimitMs: Number.POSITIVE_INFINITY,
    })
    : null;

  const { data: existingFlip, error: flipReadError } = await sb
    .from("flip_searches")
    .select("election_id, result")
    .eq("election_id", electionId)
    .maybeSingle();
  if (flipReadError) throw new Error(flipReadError.message);

  if (!flipEligible) {
    if (existingFlip) {
      report.remove("flip search (fixture is not tabulated with IRV)");
      if (!dryRun) {
        const { error } = await sb
          .from("flip_searches")
          .delete()
          .eq("election_id", electionId);
        if (error) throw new Error(`flip search prune: ${error.message}`);
      }
    }
  } else if (!votersReady) {
    report.create("flip search");
  } else if (!existingFlip) {
    report.create("flip search");
    if (!dryRun) {
      const { error } = await sb
        .from("flip_searches")
        .insert({ election_id: electionId, result: desiredFlip });
      if (error) throw new Error(`flip search: ${error.message}`);
    }
  } else if (
    stableStringify(existingFlip.result) !== stableStringify(desiredFlip)
  ) {
    report.update("flip search");
    if (!dryRun) {
      const { error } = await sb
        .from("flip_searches")
        .update({
          result: desiredFlip,
          computed_at: new Date().toISOString(),
        })
        .eq("election_id", electionId);
      if (error) throw new Error(`flip search: ${error.message}`);
    }
  } else {
    // Deliberately does NOT touch computed_at — that would churn on every run.
    report.same("flip search");
  }

  report.note(`election id ${electionId}`);
  // Names the methods the exercise moves. With four tabulations in play, "X → Y"
  // on its own no longer says which page the reader is meant to watch.
  const moved = disagreeingAlgorithms(
    fixture.lesson.baseline_winners,
    fixture.lesson.expected_winners,
  )
    .map((algorithm) =>
      `${algorithm} ${(fixture.lesson.baseline_winners[algorithm] ?? []).join(", ")} → ` +
      `${(fixture.lesson.expected_winners[algorithm] ?? []).join(", ")}`
    )
    .join("; ");
  report.note(`the documented changes move ${moved}`);
  return report;
}

// ---- Entry point ---------------------------------------------------------

async function main() {
  const args = Deno.args;
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }
  const dryRun = args.includes("--dry-run");
  const only = args
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.\n",
    );
    fail(HELP);
  }

  let fixtures = await loadFixtures();
  if (only) {
    fixtures = fixtures.filter((f) => f.slug === only);
    if (fixtures.length === 0) fail(`No fixture with slug "${only}".`);
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    `${dryRun ? "[dry run] " : ""}Seeding ${fixtures.length} case stud${
      fixtures.length === 1 ? "y" : "ies"
    } into ${url}\n`,
  );

  let totalChanges = 0;
  let failures = 0;
  for (const fixture of fixtures) {
    console.log(`${fixture.slug} — "${fixture.title}"`);
    try {
      const report = await seedFixture(sb, fixture, dryRun);
      report.print();
      totalChanges += report.changes;
    } catch (error) {
      failures++;
      console.error(`  ! ${(error as Error).message}`);
    }
    console.log("");
  }

  if (failures > 0) {
    fail(`${failures} case stud${failures === 1 ? "y" : "ies"} failed.`);
  }
  console.log(
    totalChanges === 0
      ? "Nothing to do — the database already matches every fixture."
      : `${dryRun ? "Would apply" : "Applied"} ${totalChanges} change(s).`,
  );
}

await main();

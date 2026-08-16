// Case Study fixtures — the declarative source of the curated public elections
// listed under "Case Studies" (#139/#141).
//
// A fixture is a plain JSON file describing one completed election that teaches
// one voting-theory lesson: its candidates, its named placeholder voters and
// their ballots, and — crucially — the `lesson` block, an executable statement
// of what the case study claims to teach. Nothing here talks to the network;
// `seed-case-studies.ts` supplies the database half and the unit tests use this
// module offline.
//
// Fixtures name candidates and voters by NAME, never by id. Ids are derived
// here, deterministically, so re-seeding converges instead of duplicating and a
// case study keeps the same URL forever. See docs/Features/Case Studies.md.

import type { Ballot, Candidate } from "../_shared/tabulate.ts";
import type { SimulationBallot } from "../_shared/counterfactual.ts";

export type Payload = Ballot["payload"];

export interface CaseStudyVoter {
  name: string;
  payload: Payload;
}

export interface CaseStudyChange {
  voter: string;
  payload: Payload;
}

/// Winner names for every algorithm the fixture is tabulated with, keyed
/// exactly as `tabulate()` labels its results — each entry of `algorithms`,
/// plus "fptp" when `include_fptp`. A case study whose lesson *is* a
/// disagreement between methods cannot state its claim with a single winner
/// list, and stating only the first algorithm's would leave the rest of the
/// published page unchecked.
export type WinnersByAlgorithm = Record<string, string[]>;

/// What the case study claims to teach, in a form the tests can execute:
/// tabulating `voters` must produce `baseline_winners`, and re-tabulating with
/// `changes` applied as `replace` overrides must produce `expected_winners`.
/// `changes` is deliberately shaped like the explorer's overrides so it replays
/// verbatim against simulate-counterfactual.
export interface CaseStudyLesson {
  summary: string;
  baseline_winners: WinnersByAlgorithm;
  changes: CaseStudyChange[];
  expected_winners: WinnersByAlgorithm;
}

export interface CaseStudyFixture {
  slug: string;
  title: string;
  description: string;
  algorithms: string[];
  include_fptp: boolean;
  candidates: string[];
  voters: CaseStudyVoter[];
  lesson: CaseStudyLesson;
}

/// Algorithm names on which two winner maps disagree, union of both key sets so
/// a missing entry counts as a disagreement. Shared by the lesson gate in
/// `seed-case-studies.ts` and the assertions in `case-studies.test.ts` so both
/// report a mismatch the same way.
///
/// Distinct from `diffWinners` in `_shared/counterfactual.ts`, which answers
/// the same question for two `TabulationResult[]`; here one side is a fixture's
/// declared claim and never has result_data to compare. Both compare winners
/// **positionally**, since `result_data.winner` is `winners[0]`.
export function disagreeingAlgorithms(
  a: WinnersByAlgorithm,
  b: WinnersByAlgorithm,
): string[] {
  const algorithms = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...algorithms].filter(
    (algorithm) =>
      (a[algorithm] ?? []).join(", ") !== (b[algorithm] ?? []).join(", "),
  );
}

export const FIXTURE_DIR = new URL("./case-studies/", import.meta.url);

// Fixed namespace for every id this project derives from a case study slug.
// Changing it re-points every seeded case study at a fresh election, orphaning
// the old rows — it is a constant, not a knob.
const NAMESPACE = "8b0d5ef1-6a7d-4c3a-9d2b-0f5e6c7a8b91";

const PAYLOAD_KEYS = ["approval", "irv", "star", "fptp"] as const;

/// RFC 4122 §4.3 name-based UUIDv5: SHA-1 over the namespace bytes followed by
/// the name, with the version and variant bits stamped in. Written out rather
/// than imported from `@std/uuid`, whose SHA-1 arrives via a wasm module Deno
/// refuses to type-check. `uuid-v5` in case-studies.test.ts pins it to the RFC's
/// own test vector.
export async function uuidV5(namespace: string, name: string): Promise<string> {
  const bytes = new Uint8Array(16 + name.length * 4);
  const hex = namespace.replace(/-/g, "");
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const { written } = new TextEncoder().encodeInto(name, bytes.subarray(16));
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-1", bytes.subarray(0, 16 + written)),
  );

  const out = digest.slice(0, 16);
  out[6] = (out[6] & 0x0f) | 0x50; // version 5
  out[8] = (out[8] & 0x3f) | 0x80; // RFC 4122 variant

  const s = [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-` +
    `${s.slice(16, 20)}-${s.slice(20)}`;
}

function uuidFor(name: string): Promise<string> {
  return uuidV5(NAMESPACE, name);
}

/// Stable id of the election a fixture seeds. This is the idempotency key for
/// the whole pipeline: no `slug` column and no title matching are needed.
export function electionIdFor(slug: string): Promise<string> {
  return uuidFor(`election:${slug}`);
}

/// Stable ids for a fixture's candidates, keyed by name. Derived rather than
/// generated so ballot payloads (which store candidate ids) survive a re-seed
/// unchanged.
export async function candidateIdsFor(
  fixture: CaseStudyFixture,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of fixture.candidates) {
    ids.set(name, await uuidFor(`candidate:${fixture.slug}:${name}`));
  }
  return ids;
}

/// Email of a fixture's placeholder voter. Scoped per case study so fixtures
/// never share accounts, and on the RFC 2606 reserved `.invalid` TLD, which can
/// never route — there is no reset or magic-link path into these accounts.
export function voterEmailFor(slug: string, voterName: string): string {
  return `${slug}.${slugify(voterName)}@case-studies.invalid`;
}

/// The algorithm keys `tabulate()` emits for a fixture, in the order it emits
/// them. The single source of truth for which keys a `lesson`'s winner maps
/// must cover.
export function tabulatedAlgorithms(
  algorithms: string[],
  includeFptp: boolean,
): string[] {
  return includeFptp ? [...algorithms, "fptp"] : algorithms;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- Name → id resolution ----

/// Rewrites a fixture payload's candidate NAMES into candidate ids, covering
/// every payload key so a future STAR or approval case study needs no change
/// here. Unknown names are a validation error, not a silent drop — see
/// `validateFixture`.
export function resolvePayload(
  payload: Payload,
  candidateIds: Map<string, string>,
): Payload {
  const id = (name: string) => candidateIds.get(name) ?? name;
  const out: Payload = {};
  if (payload.approval) out.approval = payload.approval.map(id);
  if (payload.irv) out.irv = payload.irv.map(id);
  if (payload.star) {
    const star: Record<string, number> = {};
    for (const [name, score] of Object.entries(payload.star)) {
      star[id(name)] = score;
    }
    out.star = star;
  }
  if (payload.fptp !== undefined) out.fptp = id(payload.fptp);
  return out;
}

export function candidateRows(
  fixture: CaseStudyFixture,
  candidateIds: Map<string, string>,
): Candidate[] {
  return fixture.candidates.map((name, position) => ({
    id: candidateIds.get(name)!,
    name,
    position,
  }));
}

/// Tabulation-ready ballots. `voterIds` maps a fixture voter name to whatever
/// identity the caller has: real profile ids in the seed script, the voter's own
/// name in the offline tests.
export function ballotRows(
  fixture: CaseStudyFixture,
  candidateIds: Map<string, string>,
  voterIds: Map<string, string>,
): SimulationBallot[] {
  return fixture.voters.map((voter) => ({
    voter_id: voterIds.get(voter.name) ?? null,
    payload: resolvePayload(voter.payload, candidateIds),
  }));
}

// ---- Loading & validation ----

/// Every fixture in `case-studies/`, slug-ordered so runs are deterministic.
/// Throws on a structurally invalid fixture: a broken case study must fail
/// loudly at load rather than seed a half-formed election.
export async function loadFixtures(
  dir: URL = FIXTURE_DIR,
): Promise<CaseStudyFixture[]> {
  const fixtures: CaseStudyFixture[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const raw = await Deno.readTextFile(new URL(entry.name, dir));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `${entry.name}: invalid JSON — ${(error as Error).message}`,
      );
    }
    const errors = validateFixture(parsed);
    if (errors.length > 0) {
      throw new Error(`${entry.name}:\n  - ${errors.join("\n  - ")}`);
    }
    fixtures.push(parsed as CaseStudyFixture);
  }
  return fixtures.sort((a, b) => a.slug.localeCompare(b.slug));
}

/// Structural validation only — the `lesson` block's claims are checked by
/// tabulating, in `case-studies.test.ts` and again in the seed script before it
/// writes anything.
export function validateFixture(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["fixture must be a JSON object"];
  }
  const f = raw as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of ["slug", "title", "description"]) {
    if (typeof f[key] !== "string" || (f[key] as string).length === 0) {
      errors.push(`${key} must be a non-empty string`);
    }
  }
  if (typeof f.slug === "string" && slugify(f.slug) !== f.slug) {
    errors.push(`slug ${JSON.stringify(f.slug)} must be lowercase kebab-case`);
  }
  if (typeof f.include_fptp !== "boolean") {
    errors.push("include_fptp must be a boolean");
  }
  if (
    !Array.isArray(f.algorithms) || f.algorithms.length === 0 ||
    !f.algorithms.every((a) => typeof a === "string")
  ) {
    errors.push("algorithms must be a non-empty array of strings");
  }

  const names = new Set<string>();
  if (!Array.isArray(f.candidates) || f.candidates.length < 2) {
    errors.push("candidates must be an array of at least two names");
  } else {
    for (const name of f.candidates) {
      if (typeof name !== "string" || name.length === 0) {
        errors.push("candidates entries must be non-empty strings");
        continue;
      }
      if (names.has(name)) errors.push(`duplicate candidate ${name}`);
      names.add(name);
    }
  }

  const voters = new Set<string>();
  if (!Array.isArray(f.voters) || f.voters.length === 0) {
    errors.push("voters must be a non-empty array");
  } else {
    f.voters.forEach((raw, i) => {
      const voter = raw as Record<string, unknown>;
      if (typeof voter?.name !== "string" || voter.name.length === 0) {
        errors.push(`voters[${i}]: name must be a non-empty string`);
        return;
      }
      if (voters.has(voter.name)) {
        errors.push(`duplicate voter ${voter.name}`);
      }
      voters.add(voter.name);
      errors.push(
        ...validatePayload(
          voter.payload,
          names,
          `voters[${i}] (${voter.name})`,
        ),
      );
    });
  }

  const algorithms = Array.isArray(f.algorithms)
    ? f.algorithms.filter((a): a is string => typeof a === "string")
    : [];
  const tabulated = new Set(
    tabulatedAlgorithms(algorithms, f.include_fptp === true),
  );

  errors.push(...validateLesson(f.lesson, names, voters, tabulated));
  return errors;
}

function validateLesson(
  raw: unknown,
  candidates: Set<string>,
  voters: Set<string>,
  tabulated: Set<string>,
): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["lesson must be an object"];
  }
  const lesson = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof lesson.summary !== "string" || lesson.summary.length === 0) {
    errors.push("lesson.summary must be a non-empty string");
  }

  for (const key of ["baseline_winners", "expected_winners"] as const) {
    errors.push(
      ...validateWinners(lesson[key], candidates, tabulated, `lesson.${key}`),
    );
  }

  if (!Array.isArray(lesson.changes) || lesson.changes.length === 0) {
    errors.push("lesson.changes must be a non-empty array");
    return errors;
  }

  const targeted = new Set<string>();
  lesson.changes.forEach((raw, i) => {
    const change = raw as Record<string, unknown>;
    const at = `lesson.changes[${i}]`;
    if (typeof change?.voter !== "string" || !voters.has(change.voter)) {
      errors.push(`${at}: voter must name a voter in this fixture`);
      return;
    }
    if (targeted.has(change.voter)) {
      errors.push(`${at}: ${change.voter} is changed more than once`);
    }
    targeted.add(change.voter);
    errors.push(...validatePayload(change.payload, candidates, at));
  });

  return errors;
}

/// An algorithm → winner-names map, checked for **full coverage** of what the
/// fixture is tabulated with. A missing key is an error rather than "no claim
/// made": in `baseline_winners` it would leave part of a published results page
/// unasserted, and in `expected_winners` the untouched methods are half the
/// point — a lesson that flips one method has to say the others held still.
function validateWinners(
  raw: unknown,
  candidates: Set<string>,
  tabulated: Set<string>,
  at: string,
): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [`${at} must be an object of algorithm name → winner names`];
  }
  const errors: string[] = [];
  const entries = Object.entries(raw as Record<string, unknown>);

  for (const [algorithm, winners] of entries) {
    if (!tabulated.has(algorithm)) {
      errors.push(
        `${at}: ${JSON.stringify(algorithm)} is not tabulated by this ` +
          `fixture (expected one of ${[...tabulated].join(", ")})`,
      );
      continue;
    }
    if (
      !Array.isArray(winners) || winners.length === 0 ||
      !winners.every((w) => typeof w === "string" && candidates.has(w))
    ) {
      errors.push(`${at}.${algorithm} must be a non-empty array of candidate names`);
    }
  }

  const declared = new Set(entries.map(([algorithm]) => algorithm));
  for (const algorithm of tabulated) {
    if (!declared.has(algorithm)) errors.push(`${at} is missing ${algorithm}`);
  }

  return errors;
}

function validatePayload(
  raw: unknown,
  candidates: Set<string>,
  at: string,
): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [`${at}: payload must be an object`];
  }
  const payload = raw as Record<string, unknown>;
  const errors: string[] = [];

  const keys = Object.keys(payload);
  if (keys.length === 0) errors.push(`${at}: payload is empty`);
  for (const key of keys) {
    if (!(PAYLOAD_KEYS as readonly string[]).includes(key)) {
      errors.push(
        `${at}: unknown payload key ${JSON.stringify(key)} ` +
          `(expected one of ${PAYLOAD_KEYS.join(", ")})`,
      );
    }
  }

  for (const key of ["approval", "irv"] as const) {
    if (payload[key] === undefined) continue;
    if (!Array.isArray(payload[key])) {
      errors.push(`${at}: payload.${key} must be an array of candidate names`);
      continue;
    }
    const seen = new Set<string>();
    for (const name of payload[key] as unknown[]) {
      if (typeof name !== "string" || !candidates.has(name)) {
        errors.push(
          `${at}: payload.${key} references ${JSON.stringify(name)}, ` +
            "which is not a candidate in this fixture",
        );
        continue;
      }
      if (seen.has(name)) {
        errors.push(`${at}: payload.${key} lists ${name} twice`);
      }
      seen.add(name);
    }
  }

  if (payload.star !== undefined) {
    const star = payload.star;
    if (typeof star !== "object" || star === null || Array.isArray(star)) {
      errors.push(
        `${at}: payload.star must be an object of candidate name → score`,
      );
    } else {
      for (
        const [name, score] of Object.entries(star as Record<string, unknown>)
      ) {
        if (!candidates.has(name)) {
          errors.push(
            `${at}: payload.star references ${name}, ` +
              "which is not a candidate in this fixture",
          );
        } else if (
          typeof score !== "number" || !Number.isInteger(score) ||
          score < 0 || score > 5
        ) {
          errors.push(`${at}: payload.star[${name}] must be an integer 0–5`);
        }
      }
    }
  }

  if (payload.fptp !== undefined) {
    if (typeof payload.fptp !== "string" || !candidates.has(payload.fptp)) {
      errors.push(
        `${at}: payload.fptp references ${JSON.stringify(payload.fptp)}, ` +
          "which is not a candidate in this fixture",
      );
    }
  }

  return errors;
}

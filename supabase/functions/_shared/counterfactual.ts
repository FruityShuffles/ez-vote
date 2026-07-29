// Counterfactual simulation helpers (M20) — the pure half of the
// `simulate-counterfactual` endpoint.
//
// The endpoint answers "what if people had voted differently?": take a real
// election's ballots, substitute modified ones, and re-run `tabulate()` on the
// copy. Everything in this module is a pure function over ballot data — the
// substitution rules, the validation of client-supplied overrides, and the
// winner comparison. Tabulation itself is untouched; it stays the single
// source of truth in `tabulate.ts`.
//
// No Deno or network imports, matching `tabulate.ts` and `derive.ts` — this
// module must stay importable from any TypeScript runtime.
//
// `applyOverrides` never mutates its input: the caller tabulates the original
// array *and* the modified copy in the same request to produce a baseline and
// a simulation that are strictly comparable.

import type { Ballot, TabulationResult } from "./tabulate.ts";

export type BallotPayload = Ballot["payload"];

/// A ballot carrying the voter identity that overrides address it by.
///
/// `voter_id` is nullable because `ballots.voter_id` is nulled when an account
/// is deleted. Such ballots still count toward every tally, but they have no
/// stable handle, so no override can target them.
export interface SimulationBallot extends Ballot {
  voter_id: string | null;
}

export type BallotOverride =
  | { op: "replace"; voter_id: string; payload: BallotPayload }
  | { op: "remove"; voter_id: string }
  | { op: "add"; payload: BallotPayload };

export const MAX_OVERRIDES = 500;
export const MIN_STAR_SCORE = 0;
export const MAX_STAR_SCORE = 5;

const PAYLOAD_KEYS = ["approval", "irv", "star", "fptp"] as const;

// ---- Applying overrides ----

/// Returns a new ballot array with the overrides applied in order. The input
/// array and its ballots are left untouched.
///
/// Assumes the overrides already passed `validateOverrides` — in particular
/// that every `replace`/`remove` names a voter that exists and that no voter is
/// targeted twice, which is what makes the result independent of ordering.
/// Unmatched targets are skipped rather than throwing.
export function applyOverrides(
  ballots: SimulationBallot[],
  overrides: BallotOverride[],
): SimulationBallot[] {
  const result: SimulationBallot[] = ballots.map((b) => ({
    voter_id: b.voter_id,
    payload: b.payload,
  }));

  for (const override of overrides) {
    if (override.op === "add") {
      result.push({ voter_id: null, payload: override.payload });
      continue;
    }

    const index = result.findIndex(
      (b) => b.voter_id !== null && b.voter_id === override.voter_id,
    );
    if (index === -1) continue;

    if (override.op === "replace") {
      result[index] = { voter_id: override.voter_id, payload: override.payload };
    } else {
      result.splice(index, 1);
    }
  }

  return result;
}

// ---- Validation ----

/// Validates client-supplied overrides against the election they target.
/// Returns human-readable errors; an empty array means the input is safe to
/// apply. Everything here crosses a JSON boundary, so the input is treated as
/// `unknown` and narrowed rather than trusted.
///
/// Rejecting is deliberate: an override naming a candidate that isn't in this
/// election, or misspelling a payload key, would otherwise tabulate silently as
/// a blank ballot and quietly skew the simulated result.
export function validateOverrides(
  overrides: unknown,
  ballots: SimulationBallot[],
  candidateIds: string[],
): string[] {
  if (!Array.isArray(overrides)) return ["overrides must be an array"];

  const errors: string[] = [];
  if (overrides.length > MAX_OVERRIDES) {
    errors.push(`too many overrides (max ${MAX_OVERRIDES})`);
    return errors;
  }

  const knownVoters = new Set(
    ballots
      .map((b) => b.voter_id)
      .filter((id): id is string => id !== null),
  );
  const candidates = new Set(candidateIds);
  const targeted = new Set<string>();

  overrides.forEach((raw, i) => {
    const at = `overrides[${i}]`;

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      errors.push(`${at}: must be an object`);
      return;
    }

    const override = raw as Record<string, unknown>;
    const op = override.op;

    if (op !== "replace" && op !== "remove" && op !== "add") {
      errors.push(`${at}: unknown op ${JSON.stringify(op)}`);
      return;
    }

    if (op === "replace" || op === "remove") {
      const voterId = override.voter_id;
      if (typeof voterId !== "string" || voterId.length === 0) {
        errors.push(`${at}: ${op} requires a voter_id`);
        return;
      }
      if (!knownVoters.has(voterId)) {
        errors.push(`${at}: no ballot for voter_id ${voterId}`);
        return;
      }
      if (targeted.has(voterId)) {
        errors.push(
          `${at}: voter_id ${voterId} is targeted by more than one override`,
        );
        return;
      }
      targeted.add(voterId);
    }

    if (op === "replace" || op === "add") {
      errors.push(...validatePayload(override.payload, candidates, at));
    }
  });

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

  const errors: string[] = [];
  const payload = raw as Record<string, unknown>;

  for (const key of Object.keys(payload)) {
    if (!(PAYLOAD_KEYS as readonly string[]).includes(key)) {
      errors.push(
        `${at}: unknown payload key ${JSON.stringify(key)} ` +
          `(expected one of ${PAYLOAD_KEYS.join(", ")})`,
      );
    }
  }

  for (const key of ["approval", "irv"] as const) {
    if (payload[key] === undefined) continue;
    const list = payload[key];
    if (!Array.isArray(list)) {
      errors.push(`${at}: payload.${key} must be an array of candidate ids`);
      continue;
    }
    const seen = new Set<string>();
    for (const entry of list) {
      if (typeof entry !== "string" || !candidates.has(entry)) {
        errors.push(
          `${at}: payload.${key} references ${JSON.stringify(entry)}, ` +
            `which is not a candidate in this election`,
        );
        continue;
      }
      if (seen.has(entry)) {
        errors.push(`${at}: payload.${key} lists ${entry} more than once`);
      }
      seen.add(entry);
    }
  }

  if (payload.star !== undefined) {
    const star = payload.star;
    if (typeof star !== "object" || star === null || Array.isArray(star)) {
      errors.push(`${at}: payload.star must be an object of candidate id → score`);
    } else {
      for (const [id, score] of Object.entries(star as Record<string, unknown>)) {
        if (!candidates.has(id)) {
          errors.push(
            `${at}: payload.star references ${id}, ` +
              `which is not a candidate in this election`,
          );
          continue;
        }
        if (
          typeof score !== "number" ||
          !Number.isInteger(score) ||
          score < MIN_STAR_SCORE ||
          score > MAX_STAR_SCORE
        ) {
          errors.push(
            `${at}: payload.star[${id}] must be an integer ` +
              `${MIN_STAR_SCORE}–${MAX_STAR_SCORE}, got ${JSON.stringify(score)}`,
          );
        }
      }
    }
  }

  if (payload.fptp !== undefined) {
    const fptp = payload.fptp;
    if (typeof fptp !== "string" || !candidates.has(fptp)) {
      errors.push(
        `${at}: payload.fptp references ${JSON.stringify(fptp)}, ` +
          `which is not a candidate in this election`,
      );
    }
  }

  return errors;
}

// ---- Comparison ----

/// Per algorithm: did the simulated ballots produce a different outcome?
///
/// Compares the `winners` array positionally rather than as a set — position
/// carries meaning, since `result_data.winner` is `winners[0]`.
export function diffWinners(
  baseline: TabulationResult[],
  simulated: TabulationResult[],
): Record<string, boolean> {
  const simulatedByAlgorithm = new Map(
    simulated.map((r) => [r.algorithm, r] as const),
  );

  const changed: Record<string, boolean> = {};
  for (const result of baseline) {
    const counterpart = simulatedByAlgorithm.get(result.algorithm);
    changed[result.algorithm] = counterpart === undefined ||
      !sameWinners(result.result_data, counterpart.result_data);
  }

  return changed;
}

function sameWinners(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const left = winnersOf(a);
  const right = winnersOf(b);
  return left.length === right.length &&
    left.every((name, i) => name === right[i]);
}

function winnersOf(resultData: Record<string, unknown>): string[] {
  const winners = resultData.winners;
  return Array.isArray(winners) ? winners.map(String) : [];
}

// Flip search (M20b, #120) — "what is the smallest set of ballot changes that
// would make candidate T a winner?", answered for IRV only in this version.
//
// The search treats `tabulate()` as a black box: every claim it makes about an
// outcome is backed by an actual tabulation, never by reasoning about IRV
// internals. That keeps it correct by construction, at the price of honesty
// constraints that are load-bearing throughout this module:
//
// - A `flipped` result is an UPPER BOUND on the number of ballots that must
//   change. `proven` is true only when k = 1, because zero changes cannot
//   unseat the baseline outcome; for k ≥ 2, IRV's non-monotonicity means a
//   cheaper set the greedy never tried may exist.
// - `no_flip_found` means the heuristic found nothing — NOT that no flip
//   exists. The greedy only tries promoting T to the top of a ballot, and some
//   flips are reachable only by moves it never considers (e.g. demoting T on a
//   ballot that already ranks T first; see the honesty regression in
//   flip.test.ts).
// - Reported edits are "ladder-minimized": each changed ballot is the voter's
//   original ranking with T bubbled up just far enough, iterated to a fixed
//   point. Heuristically small, not proven minimal.
//
// Approval and FPTP are analytically uninteresting (the minimum is readable
// off the tallies); STAR is deferred until this approach is proven for IRV.
// The per-algorithm response shape exists so STAR can be added additively.
//
// No Deno or network imports, matching `tabulate.ts` and `counterfactual.ts` —
// this module must stay importable from any TypeScript runtime. (`Date.now()`
// is runtime-agnostic and allowed.)

import { type Candidate, tabulate } from "./tabulate.ts";
import type { BallotPayload, SimulationBallot } from "./counterfactual.ts";

export const MAX_FLIP_TABULATIONS = 400;
export const MAX_FLIP_MS = 750;
// Equal to MAX_OVERRIDES so any reported change set is always replayable
// through the existing overrides path of simulate-counterfactual.
export const MAX_FLIP_BALLOTS = 500;
export const MAX_FLIP_CANDIDATES = 20;

// How many candidate ballots the greedy tries per step before committing the
// best. Correctness never depends on this — it trades tabulation budget for
// answer quality.
const GREEDY_TRIES_PER_STEP = 3;

// ---- Result types ----

export interface FlipChange {
  voter_id: string;
  /// The voter's full original payload with only the `irv` key rewritten —
  /// a ready-made `replace` override.
  payload: BallotPayload;
  /// Alteration distance from the original ballot, in the algorithm entry's
  /// `distance_metric` units.
  distance: number;
}

export type FlipTargetStatus = "flipped" | "no_flip_found" | "budget_exhausted";

export interface FlipTarget {
  candidate_id: string;
  candidate_name: string;
  status: FlipTargetStatus;
  /// Number of ballots changed. An upper bound, not a proven minimum.
  k: number | null;
  /// True only when k = 1 — the sole case where minimality is provable
  /// (zero changes cannot change the baseline outcome).
  proven: boolean;
  /// Winner names with the changes applied; shows whether T wins outright or
  /// enters a tie.
  winners: string[] | null;
  changes: FlipChange[] | null;
}

export interface FlipAlgorithmResult {
  algorithm: "irv";
  /// Discriminator for `FlipChange.distance` so a future STAR search can ship
  /// its own metric without overloading the same number.
  distance_metric: "irv_adjacent_transposition";
  baseline_winners: string[];
  /// candidate_id of the cheapest flipped target (min k, then min total
  /// distance), or null when nothing flipped.
  best: string | null;
  targets: FlipTarget[];
}

export interface FlipSearchResult {
  algorithms: FlipAlgorithmResult[];
  tabulations_used: number;
  budget: number;
  budget_exhausted: boolean;
}

// ---- Validation ----

/// Mirrors `validateOverrides`: returns human-readable errors, [] = safe to
/// run. The caps exist so worst-case cost is bounded before the search starts
/// rather than discovered at the edge function's CPU ceiling.
export function validateFlipInputs(
  algorithms: string[],
  candidates: Candidate[],
  ballots: SimulationBallot[],
): string[] {
  const errors: string[] = [];
  if (!algorithms.includes("irv")) {
    errors.push("flip search requires an election tabulated with IRV");
  }
  if (ballots.length > MAX_FLIP_BALLOTS) {
    errors.push(`too many ballots for flip search (max ${MAX_FLIP_BALLOTS})`);
  }
  if (candidates.length > MAX_FLIP_CANDIDATES) {
    errors.push(
      `too many candidates for flip search (max ${MAX_FLIP_CANDIDATES})`,
    );
  }
  return errors;
}

// ---- Budget gate ----
// Every tabulation in the search flows through this single gate: a count
// budget (deterministic, testable) backed by a wall-clock deadline (the edge
// function's CPU ceiling is a hard kill, so the search must stop early rather
// than be terminated mid-response). Exhaustion is never an error — the search
// returns whatever it has verified so far.

interface Gate {
  remaining: number;
  used: number;
  deadline: number;
  tripped: boolean;
}

interface IrvRound {
  counts: Record<string, number>;
  eliminated: string[] | null;
}

function runIrv(
  gate: Gate,
  candidates: Candidate[],
  ballots: SimulationBallot[],
): Record<string, unknown> | null {
  if (gate.remaining <= 0 || Date.now() >= gate.deadline) {
    gate.tripped = true;
    return null;
  }
  gate.remaining--;
  gate.used++;
  return tabulate(["irv"], false, candidates, ballots)[0].result_data;
}

function winnersOf(data: Record<string, unknown>): string[] {
  return Array.isArray(data.winners) ? data.winners.map(String) : [];
}

function roundsOf(data: Record<string, unknown>): IrvRound[] {
  return Array.isArray(data.rounds) ? (data.rounds as IrvRound[]) : [];
}

// ---- Standing ----
// "How close is T to winning?" read from result_data only, compared
// lexicographically: winning beats surviving longer beats a higher count in
// the last round T appears in.

type Standing = [number, number, number];

function standingOf(
  data: Record<string, unknown>,
  targetName: string,
): Standing {
  const rounds = roundsOf(data);
  let eliminatedRound = Infinity;
  let lastCount = 0;
  for (let i = 0; i < rounds.length; i++) {
    if (
      Array.isArray(rounds[i].eliminated) &&
      (rounds[i].eliminated as string[]).includes(targetName)
    ) {
      eliminatedRound = Math.min(eliminatedRound, i);
    }
    if (targetName in rounds[i].counts) {
      lastCount = rounds[i].counts[targetName];
    }
  }
  return [
    winnersOf(data).includes(targetName) ? 1 : 0,
    eliminatedRound,
    lastCount,
  ];
}

function betterStanding(a: Standing, b: Standing): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// ---- Ballot edits ----

function rankingOf(ballot: SimulationBallot): string[] {
  return ballot.payload.irv ?? [];
}

/// Adjacent-transposition distance of moving T to `position` in the original
/// ranking (inserting an unranked T at the end costs 1 before any bubbling).
function distanceToPosition(
  ranking: string[],
  targetId: string,
  position: number,
): number {
  const from = ranking.indexOf(targetId);
  if (from === -1) return 1 + (ranking.length - position);
  return from - position;
}

function withTargetAt(
  payload: BallotPayload,
  targetId: string,
  position: number,
): BallotPayload {
  const rest = (payload.irv ?? []).filter((id) => id !== targetId);
  const ranking = [
    ...rest.slice(0, position),
    targetId,
    ...rest.slice(position),
  ];
  return { ...payload, irv: ranking };
}

function maxFavorableDistance(
  ballot: SimulationBallot,
  targetId: string,
): number {
  return distanceToPosition(rankingOf(ballot), targetId, 0);
}

// ---- The search ----

interface TargetInfo {
  id: string;
  name: string;
}

/// Greedy budgeted search for the smallest replacement sets that make each
/// baseline non-winner an IRV (co-)winner. Never mutates `ballots`; never
/// throws on exhaustion. See the module header for what the statuses do and
/// do not promise.
export function findMinimalFlips(
  candidates: Candidate[],
  ballots: SimulationBallot[],
  limits: { budget?: number; timeLimitMs?: number } = {},
): FlipSearchResult {
  const budget = limits.budget ?? MAX_FLIP_TABULATIONS;
  const timeLimitMs = limits.timeLimitMs ?? MAX_FLIP_MS;
  const gate: Gate = {
    remaining: budget,
    used: 0,
    deadline: Date.now() + timeLimitMs,
    tripped: false,
  };

  const baselineData = runIrv(gate, candidates, ballots);
  const baselineWinners = baselineData ? winnersOf(baselineData) : [];
  const targets = baselineData
    ? orderTargets(candidates, baselineData, baselineWinners)
    : candidates.map((c) => ({ id: c.id, name: c.name }));

  const results: FlipTarget[] = [];
  for (const target of targets) {
    if (gate.tripped || !baselineData) {
      results.push(exhaustedTarget(target));
      continue;
    }
    results.push(searchTarget(gate, candidates, ballots, baselineData, target));
  }

  let best: string | null = null;
  let bestKey: [number, number] | null = null;
  for (const t of results) {
    if (t.status !== "flipped" || t.k === null || t.changes === null) continue;
    const key: [number, number] = [
      t.k,
      t.changes.reduce((sum, c) => sum + c.distance, 0),
    ];
    if (
      bestKey === null ||
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && key[1] < bestKey[1])
    ) {
      best = t.candidate_id;
      bestKey = key;
    }
  }

  return {
    algorithms: [
      {
        algorithm: "irv",
        distance_metric: "irv_adjacent_transposition",
        baseline_winners: baselineWinners,
        best,
        targets: results,
      },
    ],
    tabulations_used: gate.used,
    budget,
    budget_exhausted: gate.tripped,
  };
}

function exhaustedTarget(target: TargetInfo): FlipTarget {
  return {
    candidate_id: target.id,
    candidate_name: target.name,
    status: "budget_exhausted",
    k: null,
    proven: false,
    winners: null,
    changes: null,
  };
}

/// Baseline non-winners, ordered so the likeliest-cheap flips consume budget
/// first: the tabulated runner-up, then by count in the last round each
/// candidate appears in, then by surviving longer (never-eliminated survivors
/// ahead of eliminated ones).
function orderTargets(
  candidates: Candidate[],
  baselineData: Record<string, unknown>,
  baselineWinners: string[],
): TargetInfo[] {
  const rounds = roundsOf(baselineData);
  const runnerUp = typeof baselineData.runner_up === "string"
    ? baselineData.runner_up
    : null;

  const rank = (name: string): [number, number, number] => {
    let lastCount = 0;
    let eliminatedRound = Infinity;
    for (let i = 0; i < rounds.length; i++) {
      if (name in rounds[i].counts) lastCount = rounds[i].counts[name];
      if (
        Array.isArray(rounds[i].eliminated) &&
        (rounds[i].eliminated as string[]).includes(name)
      ) {
        eliminatedRound = Math.min(eliminatedRound, i);
      }
    }
    return [name === runnerUp ? 1 : 0, lastCount, eliminatedRound];
  };

  return candidates
    .filter((c) => !baselineWinners.includes(c.name))
    .map((c) => ({ id: c.id, name: c.name, key: rank(c.name) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i];
      }
      return 0;
    })
    .map(({ id, name }) => ({ id, name }));
}

function searchTarget(
  gate: Gate,
  candidates: Candidate[],
  ballots: SimulationBallot[],
  baselineData: Record<string, unknown>,
  target: TargetInfo,
): FlipTarget {
  // Working copy: committed changes live here; the input array is never
  // written. `changed` maps ballot index → committed payload.
  const working = ballots.slice();
  const changed = new Map<number, BallotPayload>();
  let currentData = baselineData;

  // Eligible for change: attributable (non-null voter_id) ballots that do not
  // already rank T first. A max-favorable rewrite of a T-first ballot is a
  // near-no-op, and the flips reachable by *other* edits to such ballots are
  // exactly what `no_flip_found`'s honesty caveat covers.
  const eligible = new Set<number>();
  for (let i = 0; i < ballots.length; i++) {
    if (ballots[i].voter_id === null) continue;
    if (rankingOf(ballots[i])[0] === target.id) continue;
    eligible.add(i);
  }

  // ---- Greedy phase ----
  while (!winnersOf(currentData).includes(target.name)) {
    if (eligible.size === 0) {
      return {
        candidate_id: target.id,
        candidate_name: target.name,
        status: "no_flip_found",
        k: null,
        proven: false,
        winners: null,
        changes: null,
      };
    }

    const leaders = candidates
      .filter((c) => winnersOf(currentData).includes(c.name))
      .map((c) => c.id);
    const trials = [...eligible]
      .map((i) => ({ i, key: harmKey(ballots[i], target.id, leaders) }))
      .sort((a, b) => {
        for (let k = 0; k < a.key.length; k++) {
          if (a.key[k] !== b.key[k]) return b.key[k] - a.key[k];
        }
        return 0;
      })
      .slice(0, GREEDY_TRIES_PER_STEP);

    let bestTrial: {
      i: number;
      payload: BallotPayload;
      data: Record<string, unknown>;
    } | null = null;
    let bestScore: Standing | null = null;
    let flipped = false;

    for (const { i } of trials) {
      const payload = withTargetAt(ballots[i].payload, target.id, 0);
      const trialState = working.slice();
      trialState[i] = { voter_id: ballots[i].voter_id, payload };
      const data = runIrv(gate, candidates, trialState);
      if (data === null) break;

      const score = standingOf(data, target.name);
      if (bestScore === null || betterStanding(score, bestScore)) {
        bestTrial = { i, payload, data };
        bestScore = score;
      }
      // A verified flip is committed immediately — trying the rest of the
      // batch could only find an equally-sized answer.
      if (winnersOf(data).includes(target.name)) {
        flipped = true;
        break;
      }
    }

    // Budget died before anything in this batch flipped: no verified flip for
    // this target exists, so best-so-far is nothing.
    if (gate.tripped && !flipped) return exhaustedTarget(target);
    if (bestTrial === null) return exhaustedTarget(target);

    // Commit the best trial even when the standing got worse — accumulating
    // max-favorable ballots is the only guaranteed direction of progress, and
    // termination is bounded by the eligible count and the budget.
    working[bestTrial.i] = {
      voter_id: ballots[bestTrial.i].voter_id,
      payload: bestTrial.payload,
    };
    changed.set(bestTrial.i, bestTrial.payload);
    eligible.delete(bestTrial.i);
    currentData = bestTrial.data;
  }

  // ---- Minimization ----
  const flipData = minimize(
    gate,
    candidates,
    ballots,
    working,
    changed,
    target,
    currentData,
  );

  const changes: FlipChange[] = [...changed.entries()].map(([i, payload]) => ({
    voter_id: ballots[i].voter_id as string,
    payload,
    distance: changeDistance(ballots[i], payload, target.id),
  }));

  return {
    candidate_id: target.id,
    candidate_name: target.name,
    status: "flipped",
    k: changes.length,
    proven: changes.length === 1,
    winners: winnersOf(flipData),
    changes,
  };
}

/// Payload-only ordering heuristic: prefer ballots that rank a current leader
/// furthest above T (T unranked counts as ranked last), tie-broken toward the
/// cheapest max-favorable rewrite.
function harmKey(
  ballot: SimulationBallot,
  targetId: string,
  leaders: string[],
): [number, number] {
  const ranking = rankingOf(ballot);
  const targetPos = ranking.includes(targetId)
    ? ranking.indexOf(targetId)
    : ranking.length;
  let leaderPos = Infinity;
  for (const id of leaders) {
    const pos = ranking.indexOf(id);
    if (pos !== -1) leaderPos = Math.min(leaderPos, pos);
  }
  const harm = leaderPos < targetPos ? targetPos - leaderPos : 0;
  // Negated so that within equal harm, smaller rewrites sort first under the
  // shared descending comparison.
  return [harm, -maxFavorableDistance(ballot, targetId)];
}

function changeDistance(
  original: SimulationBallot,
  payload: BallotPayload,
  targetId: string,
): number {
  const position = (payload.irv ?? []).indexOf(targetId);
  return distanceToPosition(rankingOf(original), targetId, position);
}

/// Ladder minimization, iterated to a fixed point: sweep the changed set, and
/// for each member try every strictly cheaper rung from the original upward,
/// accepting the first that keeps T winning. Rung 0 is the unmodified
/// original — accepting it drops the change and shrinks k. Sweeps repeat
/// because a later reduction can unlock an earlier one under IRV's
/// non-monotonicity; each sweep strictly decreases total distance, so this
/// terminates. Exhaustion mid-pass keeps every reduction made so far — the
/// set still verifiably flips.
function minimize(
  gate: Gate,
  candidates: Candidate[],
  ballots: SimulationBallot[],
  working: SimulationBallot[],
  changed: Map<number, BallotPayload>,
  target: TargetInfo,
  flipData: Record<string, unknown>,
): Record<string, unknown> {
  let reduced = true;
  while (reduced && !gate.tripped) {
    reduced = false;
    const members = [...changed.keys()].sort(
      (a, b) =>
        changeDistance(ballots[b], changed.get(b)!, target.id) -
        changeDistance(ballots[a], changed.get(a)!, target.id),
    );

    for (const i of members) {
      const currentDistance = changeDistance(
        ballots[i],
        changed.get(i)!,
        target.id,
      );
      const ranking = rankingOf(ballots[i]);

      // Rungs, cheapest first: the original payload (distance 0), then T at
      // ever-higher positions strictly cheaper than the committed rung.
      const rungs: { payload: BallotPayload; distance: number }[] = [
        { payload: ballots[i].payload, distance: 0 },
      ];
      const positions = ranking.includes(target.id)
        ? ranking.indexOf(target.id) - 1
        : ranking.length;
      for (let p = positions; p >= 1; p--) {
        rungs.push({
          payload: withTargetAt(ballots[i].payload, target.id, p),
          distance: distanceToPosition(ranking, target.id, p),
        });
      }

      for (const rung of rungs) {
        if (rung.distance >= currentDistance) continue;
        const trialState = working.slice();
        trialState[i] = {
          voter_id: ballots[i].voter_id,
          payload: rung.payload,
        };
        const data = runIrv(gate, candidates, trialState);
        if (data === null) return flipData;
        if (winnersOf(data).includes(target.name)) {
          if (rung.distance === 0) {
            working[i] = ballots[i];
            changed.delete(i);
          } else {
            working[i] = {
              voter_id: ballots[i].voter_id,
              payload: rung.payload,
            };
            changed.set(i, rung.payload);
          }
          flipData = data;
          reduced = true;
          break;
        }
      }
    }
  }
  return flipData;
}

// Strategic voting search (#149) — "could this voter have gotten a better
// outcome by voting differently?", answered per method.
//
// The complement to `flip.ts`. That module asks a question about the
// ELECTORATE ("what set of changes would seat someone else?"); this one asks
// about an INDIVIDUAL ("holding everyone else fixed, was this voter's honest
// ballot the best ballot for them?"). It is the manipulability question, and
// the answer is the concrete, named-voter form of "this method rewards
// dishonesty".
//
// THREE RULES GOVERN EVERYTHING HERE.
//
// 1. METHODS ARE ANALYZED IN ISOLATION. No real election anywhere runs a
//    combined ballot; EZVote's four-key payload is a teaching apparatus for
//    showing four counts of one electorate side by side. A finding about IRV is
//    therefore: *holding every other IRV ranking fixed, had this voter submitted
//    ranking R instead, IRV's winner would have been X*. Whether R is derivable
//    from the same voter's STAR scores under this site's ballot template is a
//    fact about EZVote's input controls, not about IRV. Every trial edits
//    exactly one payload key and carries the rest through untouched — the same
//    thing `flip.ts` already does with `irv` — so it is expected and correct for
//    this search to name a ballot change the voter could not have entered
//    through EZVote's own combined ballot screen.
//
// 2. ONLY THE WINNER COUNTS. An outcome is the `winners` array and nothing
//    else. Round structure, runoff composition, tallies and margins never
//    register as a better outcome.
//
// 3. NO STRATEGY LABELS. The generators below (bullet vote, burial, push-over,
//    compromise) are internal scaffolding for proposing trial ballots. The
//    output never names a strategy — naming one would be a claim about the
//    voter's intent that the search cannot support. The UI spells out what the
//    change involves instead.
//
// HONESTY CONTRACT — the inverse of the flip search's, and worth stating
// plainly because it is easy to read backwards:
//
//   * Every reported opportunity is PROVEN. It is an existence claim, and it is
//     verified by re-tabulating the real tabulator with the trial ballot
//     substituted in. Pruning may reason about tallies; a reported answer never
//     does.
//   * Absence is NOT proven. An empty result never means the election was
//     strategy-proof — the search tries a bounded set of trial ballots under a
//     bounded budget, so an opportunity it did not find may still exist.
//
// What multiple enabled algorithms legitimately contribute is better evidence
// about the voter's PREFERENCES, never a constraint on their ballot: STAR's 0–5
// scores rank candidates more finely than an approval set does, which lets
// `utilitiesOf` judge "better for this voter" more precisely while searching
// IRV. See §"Utility" below.
//
// No Deno or network imports, matching `tabulate.ts`, `counterfactual.ts` and
// `flip.ts` — this module must stay importable from any TypeScript runtime.
// (`Date.now()` is runtime-agnostic and allowed.)

import { type Candidate, computeFPTP, tabulate } from "./tabulate.ts";
import type { BallotPayload, SimulationBallot } from "./counterfactual.ts";

/// Tabulation budget. Sized against `flip.ts`'s measured ~720 ms for 400 IRV
/// tabulations at worst-case eligible size (500 ballots x 20 candidates), which
/// puts 300 at roughly 540 ms of IRV — the most expensive method here, and the
/// only one that reaches this ceiling. Approval, FPTP and STAR are a fraction of
/// that. See `docs/Backend/Edge Function.md`, "The close-path CPU budget".
export const MAX_STRATEGY_TABULATIONS = 300;
/// Live-path deadline, for elections with no precomputed row.
export const MAX_STRATEGY_MS = 400;
/// Close-path deadline (`compute-results`). Deliberately equal to the live one
/// rather than generous like `PRECOMPUTE_FLIP_MS`: this search runs *after* the
/// flip precompute in the same 2 s CPU ceiling, so it gets the leftovers, and
/// the caller clamps it further by the time already spent.
export const PRECOMPUTE_STRATEGY_MS = 400;
// Equal to MAX_OVERRIDES so any reported ballot is always replayable through
// the existing overrides path of simulate-counterfactual.
export const MAX_STRATEGY_BALLOTS = 500;
export const MAX_STRATEGY_CANDIDATES = 20;

/// Distinct honest ballots searched per method, largest group first. The budget
/// above cannot reach past this many anyway; the cap exists so trial generation
/// itself stays bounded on a 500-ballot election.
const MAX_GROUPS_PER_METHOD = 100;
/// Trial ballots generated per distinct ballot per method. STAR's full sweep is
/// the only generator that would exceed this at 20 candidates.
const MAX_TRIALS_PER_BALLOT = 48;

/// Floating-point slack for "strictly better". The utility layers below are
/// separated by at least ~1e-7 at the worst case (20 candidates, four layers),
/// so this discriminates real gains from arithmetic noise without swallowing
/// any of them.
const GAIN_EPSILON = 1e-9;

const MAX_STAR_SCORE = 5;

// ---- Result types ----

export type StrategyMethod = "approval" | "irv" | "star" | "fptp";

/// Search order and display order alike. Matches the app's method ordering:
/// the enabled algorithms in their canonical order, then FPTP as the comparison.
const METHOD_ORDER: StrategyMethod[] = ["approval", "irv", "star", "fptp"];

export interface StrategicOpportunity {
  /// The method whose winner improves for this voter. Findings are per method
  /// and never combined — see rule 1.
  algorithm: StrategyMethod;
  voter_id: string;
  /// The voter's full honest payload with only this method's key rewritten —
  /// a ready-made `replace` override, exactly like `FlipChange.payload`.
  ///
  /// Deliberately carries no display name: `flip_searches` stores voter ids
  /// only, so a renamed account is never contradicted by a stale stored answer.
  /// The client resolves names from the ballots it already has.
  payload: BallotPayload;
  baseline_winners: string[];
  /// Winners with this one ballot swapped in. Verified, not predicted.
  winners: string[];
  /// How many attributable ballots in this election are identical to this
  /// voter's honest ballot, this one included. All of them had the same
  /// opportunity; the search reports it once.
  shared_by: number;
}

export interface StrategicSearchResult {
  /// Best first, by how much the voter's own ballot says they gained.
  opportunities: StrategicOpportunity[];
  /// Methods that survived the pivotality screen and were actually searched.
  /// A method absent here was proved unreachable by any single ballot, which is
  /// a stronger statement than "nothing found".
  algorithms_searched: StrategyMethod[];
  /// Distinct attributable honest ballots in this election.
  distinct_ballots: number;
  /// Attributable ballots covered by the distinct ballots actually searched.
  /// Lower than the election's ballot count when the group cap bites.
  ballots_examined: number;
  tabulations_used: number;
  budget: number;
  budget_exhausted: boolean;
}

// ---- Validation ----

/// Mirrors `validateFlipInputs`: human-readable errors, [] = safe to run.
///
/// No algorithm requirement, unlike the flip search — every method has a
/// strategy space, so any tabulated election is searchable.
export function validateStrategyInputs(
  candidates: Candidate[],
  ballots: SimulationBallot[],
): string[] {
  const errors: string[] = [];
  if (ballots.length > MAX_STRATEGY_BALLOTS) {
    errors.push(
      `too many ballots for the strategic voting search (max ${MAX_STRATEGY_BALLOTS})`,
    );
  }
  if (candidates.length > MAX_STRATEGY_CANDIDATES) {
    errors.push(
      `too many candidates for the strategic voting search (max ${MAX_STRATEGY_CANDIDATES})`,
    );
  }
  return errors;
}

// ---- Budget gate ----
// Identical in shape to `flip.ts`'s: a count budget (deterministic, testable)
// backed by a wall-clock deadline (the edge function's CPU ceiling is a hard,
// uncatchable kill, so the search must stop early rather than be terminated
// mid-response). Exhaustion is never an error — every verified finding is kept.

interface Gate {
  remaining: number;
  used: number;
  deadline: number;
  tripped: boolean;
}

/// The single place a tabulation happens. FPTP goes through `computeFPTP`
/// directly rather than `tabulate([], true, ...)` because the orchestrator
/// derives its `hasIrv` fallback from the algorithm list it was handed — asking
/// it for FPTP-with-fallback would force it to run a whole IRV count as well.
/// Same function, same result, one count instead of two.
function runMethod(
  gate: Gate,
  method: StrategyMethod,
  candidates: Candidate[],
  ballots: SimulationBallot[],
  hasIrv: boolean,
): Record<string, unknown> | null {
  if (gate.remaining <= 0 || Date.now() >= gate.deadline) {
    gate.tripped = true;
    return null;
  }
  gate.remaining--;
  gate.used++;
  if (method === "fptp") return computeFPTP(candidates, ballots, hasIrv);
  return tabulate([method], false, candidates, ballots)[0].result_data;
}

function winnersOf(data: Record<string, unknown>): string[] {
  return Array.isArray(data.winners) ? data.winners.map(String) : [];
}

function numbersOf(raw: unknown): Record<string, number> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, number>
    : {};
}

// ---- Utility ----
// "Better for this voter" has to mean something precise, and the only evidence
// of what this voter wants is the ballot they cast — which the issue's premise
// says to read as honest.
//
// Signals are layered richest first, each weighted by a further factor of
// ε = 1/(10n) so a lower layer can only ever break an exact tie in a higher one,
// never reverse it: the coarsest gap any layer can produce (1/n, from a full
// ranking) is wider than everything below it combined. That is the legitimate
// multi-algorithm leverage — when an election also ran STAR, those 0–5 scores
// say HOW MUCH this voter prefers Ada to Bo, which sharpens the judgment of
// "better" while searching IRV. It is evidence about the person, never a
// constraint on the ballot.

function effectivePick(payload: BallotPayload): string | undefined {
  // The honest FPTP ballot. `computeFPTP` falls back to `irv[0]` when no
  // explicit pick is stored (tabulate.ts), and IRV-bearing ballots store none,
  // so the voter's FPTP vote is this, not `payload.fptp`.
  return payload.fptp ?? payload.irv?.[0];
}

function utilitiesOf(
  payload: BallotPayload,
  candidates: Candidate[],
): Map<string, number> {
  const layers: Array<(id: string) => number> = [];

  const star = payload.star;
  if (star !== undefined) {
    layers.push((id) => (star[id] ?? 0) / MAX_STAR_SCORE);
  }

  const ranking = payload.irv;
  if (ranking !== undefined && ranking.length > 0) {
    const length = ranking.length;
    layers.push((id) => {
      const at = ranking.indexOf(id);
      return at === -1 ? 0 : (length - at) / length;
    });
  }

  const approval = payload.approval;
  if (approval !== undefined) {
    const approved = new Set(approval);
    layers.push((id) => (approved.has(id) ? 1 : 0));
  }

  const pick = effectivePick(payload);
  if (pick !== undefined) {
    layers.push((id) => (id === pick ? 1 : 0));
  }

  const epsilon = 1 / (10 * Math.max(1, candidates.length));
  const utilities = new Map<string, number>();
  for (const candidate of candidates) {
    let value = 0;
    let weight = 1;
    for (const layer of layers) {
      value += weight * layer(candidate.id);
      weight *= epsilon;
    }
    utilities.set(candidate.id, value);
  }
  return utilities;
}

/// The utility of an OUTCOME, which is a `winners` array: the mean over the
/// winners, i.e. a uniform lottery on a tie.
///
/// This is what makes "turn a loss into a tie" and "turn a tie into a win"
/// register as the real single-voter manipulations they are. A strict-dominance
/// rule that only looked at `winner` would miss both.
function outcomeUtility(
  winners: string[],
  byName: Map<string, number>,
): number {
  if (winners.length === 0) return 0;
  let total = 0;
  for (const name of winners) total += byName.get(name) ?? 0;
  return total / winners.length;
}

// ---- Grouping ----
// One search per distinct honest ballot. Identical payloads have identical
// utilities and identical trials, so searching the second one could only
// reproduce the first answer with a different name on it.

interface BallotGroup {
  /// Index into the original ballots array of the member this search speaks for.
  index: number;
  voterId: string;
  /// Attributable members, this one included.
  size: number;
  utilitiesById: Map<string, number>;
  utilitiesByName: Map<string, number>;
  maxUtility: number;
  /// Candidate ids, most-preferred first. Ties keep ballot-order position.
  preference: string[];
}

/// Stable key over the four payload keys. `approval` is sorted because it is a
/// set, `star` because object key order is not meaningful; `irv` is left alone
/// because its order IS the ballot.
function payloadKey(payload: BallotPayload): string {
  const star = payload.star === undefined ? null : Object.keys(payload.star)
    .sort()
    .map((id) => `${id}=${payload.star![id]}`)
    .join(",");
  return JSON.stringify([
    payload.approval === undefined ? null : [...payload.approval].sort(),
    payload.irv ?? null,
    star,
    payload.fptp ?? null,
  ]);
}

/// Groups the ATTRIBUTABLE ballots only. A ballot whose account was deleted has
/// `voter_id: null` and still counts toward every tally, but no override can
/// address it, so no opportunity could be offered for it.
function groupBallots(
  ballots: SimulationBallot[],
  candidates: Candidate[],
): BallotGroup[] {
  const byKey = new Map<string, BallotGroup>();

  for (let i = 0; i < ballots.length; i++) {
    const voterId = ballots[i].voter_id;
    if (voterId === null) continue;
    const key = payloadKey(ballots[i].payload);
    const existing = byKey.get(key);
    if (existing) {
      existing.size++;
      continue;
    }

    const utilitiesById = utilitiesOf(ballots[i].payload, candidates);
    const utilitiesByName = new Map<string, number>();
    for (const candidate of candidates) {
      utilitiesByName.set(
        candidate.name,
        utilitiesById.get(candidate.id) ?? 0,
      );
    }
    const preference = candidates
      .map((candidate) => candidate.id)
      .sort((a, b) => (utilitiesById.get(b) ?? 0) - (utilitiesById.get(a) ?? 0));

    byKey.set(key, {
      index: i,
      voterId,
      size: 1,
      utilitiesById,
      utilitiesByName,
      maxUtility: Math.max(0, ...utilitiesById.values()),
      preference,
    });
  }

  return [...byKey.values()];
}

// ---- Pivotality ----
// Read off the baseline `result_data` alone: no tabulation, O(candidates). A
// method that fails this screen is one where NO single ballot can move the
// winners array, which is a proof, not a heuristic — so such a method is
// reported as unsearched rather than as "nothing found".
//
// Each bound below is the most one ballot can do to the numbers the method
// decides on.

function isPivotal(
  method: StrategyMethod,
  data: Record<string, unknown>,
): boolean {
  const winners = winnersOf(data);
  // An existing tie can be broken by a single ballot in every method here.
  if (winners.length !== 1) return true;

  switch (method) {
    case "approval":
    case "fptp": {
      // One ballot moves any tally by at most 1, so a rival 3 or more behind
      // can neither catch nor pass the winner.
      const tallies = numbersOf(data.tallies);
      const top = tallies[winners[0]] ?? 0;
      return Object.entries(tallies).some(
        ([name, tally]) => name !== winners[0] && top - tally <= 2,
      );
    }
    case "irv": {
      // Eliminations cascade, so any multi-round count is treated as reachable.
      // The one provable case is an outright first-round majority wide enough
      // to survive losing this voter: the trials always rank someone, so the
      // denominator is unchanged and the winner's count drops by at most 1.
      const rounds = Array.isArray(data.rounds) ? data.rounds : [];
      if (rounds.length !== 1) return true;
      const counts = numbersOf(
        (rounds[0] as Record<string, unknown>)?.counts,
      );
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      return !((counts[winners[0]] ?? 0) - 1 > total / 2);
    }
    case "star": {
      // One ballot moves a candidate's score total by at most 5, so a pairwise
      // score margin moves by at most 10; it moves each runoff preference count
      // by at most 1, so that margin moves by at most 2.
      const scores = Object.values(numbersOf(data.scores)).sort((a, b) => b - a);
      if (scores.length >= 3 && scores[1] - scores[2] <= 10) return true;
      const runoff = numbersOf(data.runoff);
      const preferences = Object.values(runoff);
      if (preferences.length < 2) return true;
      return Math.abs(preferences[0] - preferences[1]) <= 2;
    }
  }
}

// ---- Trial generation ----
// Per method, in that method's own ballot space: each trial is the voter's full
// payload with exactly one key rewritten (rule 1).
//
// TRUNCATION IS DELIBERATELY ABSENT from the IRV generator. A shortened ranking
// behaves identically to the full one in every round until every candidate it
// does rank has been eliminated; from that point it only WITHHOLDS support, and
// it withholds it from the remaining candidates in precisely the voter's own
// order of preference, at a moment when everyone they ranked higher is already
// out. Truncating is therefore weakly harmful to the truncator and can never be
// an opportunity for them. (This is a claim about strategy, not about outcomes:
// `computeIRV` recomputes its majority denominator each round from
// non-exhausted ballots, so truncation *can* move a winner — just never in the
// truncator's favour.)

function trialsFor(
  method: StrategyMethod,
  group: BallotGroup,
  payload: BallotPayload,
  includeFptp: boolean,
): BallotPayload[] {
  switch (method) {
    case "fptp":
      return fptpTrials(group, payload);
    case "approval":
      return approvalTrials(group, payload);
    case "irv":
      return irvTrials(group, payload).map((trial) => pinFptp(trial, payload, includeFptp));
    case "star":
      return starTrials(group, payload);
  }
}

/// Isolation, in the one place the four-key payload does not provide it for
/// free: FPTP has no key of its own on an IRV ballot — `computeFPTP` reads
/// `irv[0]` — so rewriting `irv` would silently move the FPTP count too.
///
/// Writing the voter's honest effective pick into `fptp` makes explicit what
/// was already implicit and changes nothing about their FPTP vote, which is
/// exactly what isolation asks for: a finding about IRV must leave every other
/// count where it was. Elections with no FPTP column get no spurious key.
function pinFptp(
  trial: BallotPayload,
  honest: BallotPayload,
  includeFptp: boolean,
): BallotPayload {
  if (!includeFptp || honest.fptp !== undefined) return trial;
  const pick = effectivePick(honest);
  return pick === undefined ? trial : { ...trial, fptp: pick };
}

/// The entire FPTP strategy space, exhaustive: a ballot is one name.
function fptpTrials(
  group: BallotGroup,
  payload: BallotPayload,
): BallotPayload[] {
  const honest = effectivePick(payload);
  // Setting `fptp` explicitly overrides the `irv[0]` fallback for FPTP's count
  // and leaves the `irv` key — and therefore IRV's count — untouched.
  return group.preference
    .filter((id) => id !== honest)
    .map((id) => ({ ...payload, fptp: id }));
}

/// Prefixes of the voter's preference order, from bullet vote to approve-all.
/// Approving someone you rate higher is never worse than approving someone you
/// rate lower, so the thresholds are where the gains live.
///
/// An approval-only election supplies no order — every approved candidate sits
/// at utility 1 — so where the honest ballot carries no strict order among the
/// approved, a weaker unordered generator is added as well: drop each approved,
/// add each unapproved, bullet-vote each approved. Honestly weaker coverage
/// than the threshold sweep, not the same thing under another name.
function approvalTrials(
  group: BallotGroup,
  payload: BallotPayload,
): BallotPayload[] {
  const honest = new Set(payload.approval ?? []);
  const seen = new Set<string>([setKey([...honest])]);
  const trials: BallotPayload[] = [];

  const push = (approval: string[]) => {
    const key = setKey(approval);
    if (seen.has(key)) return;
    seen.add(key);
    trials.push({ ...payload, approval });
  };

  // Ascending prefixes first: the bullet vote is the sharpest single change,
  // and each step from there is one more concession.
  for (let k = 1; k <= group.preference.length; k++) {
    push(group.preference.slice(0, k));
  }
  push([]);

  const approvedUtilities = new Set(
    [...honest].map((id) => group.utilitiesById.get(id) ?? 0),
  );
  if (approvedUtilities.size <= 1) {
    for (const id of honest) push([...honest].filter((other) => other !== id));
    for (const id of group.preference) {
      if (!honest.has(id)) push([...honest, id]);
    }
    for (const id of honest) push([id]);
  }

  return trials;
}

function setKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

/// Each candidate promoted to first, each moved to last, then the pairwise
/// combination. Ordered so the most promising single move is tried first, which
/// matters under the round-robin: on a large election a group may only get its
/// first few trials.
function irvTrials(
  group: BallotGroup,
  payload: BallotPayload,
): BallotPayload[] {
  const honest = payload.irv ?? [];
  if (honest.length === 0) {
    return group.preference.map((id) => ({ ...payload, irv: [id] }));
  }

  const seen = new Set<string>([honest.join("|")]);
  const trials: BallotPayload[] = [];
  const push = (ranking: string[]) => {
    const key = ranking.join("|");
    if (seen.has(key)) return;
    seen.add(key);
    trials.push({ ...payload, irv: ranking });
  };

  const ranked = group.preference.filter((id) => honest.includes(id));
  const leastPreferred = [...ranked].reverse();

  for (const id of ranked) push(moveTo(honest, id, 0));
  for (const id of leastPreferred) push(moveTo(honest, id, honest.length - 1));
  for (const promoted of ranked.slice(0, 3)) {
    for (const demoted of leastPreferred) {
      if (demoted === promoted) continue;
      push(moveTo(moveTo(honest, promoted, 0), demoted, honest.length - 1));
    }
  }

  return trials;
}

function moveTo(ranking: string[], id: string, position: number): string[] {
  const rest = ranking.filter((other) => other !== id);
  return [...rest.slice(0, position), id, ...rest.slice(position)];
}

/// A score vector is a score vector: exaggerating a favourite, burying a rival
/// and lifting someone over the top-two boundary are all just points on the
/// same sweep, and the search does not need to tell them apart (rule 3).
function starTrials(
  group: BallotGroup,
  payload: BallotPayload,
): BallotPayload[] {
  const honest = payload.star ?? {};
  const scoreOf = (id: string) => honest[id] ?? 0;
  const seen = new Set<string>([scoresKey(honest, group.preference)]);
  const trials: BallotPayload[] = [];
  const push = (star: Record<string, number>) => {
    const key = scoresKey(star, group.preference);
    if (seen.has(key)) return;
    seen.add(key);
    trials.push({ ...payload, star });
  };

  // Favourite at the ceiling, one rival at the floor.
  const favourite = group.preference[0];
  if (favourite !== undefined) {
    for (const id of group.preference.slice(1)) {
      push({ ...honest, [favourite]: MAX_STAR_SCORE, [id]: 0 });
    }
  }

  // Min-max at every threshold the honest ballot already draws.
  const thresholds = [...new Set(group.preference.map(scoreOf))].sort(
    (a, b) => b - a,
  );
  for (const threshold of thresholds) {
    const star: Record<string, number> = {};
    for (const id of group.preference) {
      star[id] = scoreOf(id) >= threshold ? MAX_STAR_SCORE : 0;
    }
    push(star);
  }

  // Single-candidate sweep, extremes first.
  for (const id of group.preference) {
    for (const score of [MAX_STAR_SCORE, 0, 1, 2, 3, 4]) {
      if (score === scoreOf(id)) continue;
      push({ ...honest, [id]: score });
    }
  }

  return trials;
}

function scoresKey(
  star: Record<string, number>,
  candidateIds: string[],
): string {
  return candidateIds.map((id) => star[id] ?? 0).join("|");
}

// ---- The search ----

interface Queue {
  group: BallotGroup;
  trials: BallotPayload[];
  next: number;
  done: boolean;
}

interface ScoredOpportunity {
  gain: number;
  opportunity: StrategicOpportunity;
}

/// Budgeted search for ballots that would have served their voter better than
/// the one they cast. Never mutates `ballots`; never throws on exhaustion. See
/// the module header for what a result does and does not promise.
export function findStrategicOpportunities(
  algorithms: string[],
  includeFptp: boolean,
  candidates: Candidate[],
  ballots: SimulationBallot[],
  limits: { budget?: number; timeLimitMs?: number } = {},
): StrategicSearchResult {
  const budget = limits.budget ?? MAX_STRATEGY_TABULATIONS;
  const timeLimitMs = limits.timeLimitMs ?? MAX_STRATEGY_MS;
  const gate: Gate = {
    remaining: budget,
    used: 0,
    deadline: Date.now() + timeLimitMs,
    tripped: false,
  };

  const hasIrv = algorithms.includes("irv");
  const methods = METHOD_ORDER.filter((method) =>
    method === "fptp" ? includeFptp : algorithms.includes(method)
  );
  const groups = groupBallots(ballots, candidates);
  // Largest first, so the ballot the most voters actually cast is the one the
  // budget is spent on when it runs short.
  groups.sort((a, b) => b.size - a.size);
  const searchable = groups.slice(0, MAX_GROUPS_PER_METHOD);

  const found: ScoredOpportunity[] = [];
  const searched: StrategyMethod[] = [];

  for (const method of methods) {
    const baseline = runMethod(gate, method, candidates, ballots, hasIrv);
    if (baseline === null) break;
    if (!isPivotal(method, baseline)) continue;
    searched.push(method);

    const baselineWinners = winnersOf(baseline);
    const queues: Queue[] = [];
    for (const group of searchable) {
      // Already optimal: the outcome this voter got is already worth as much as
      // any outcome could be to them, so no ballot can improve on it.
      const baselineValue = outcomeUtility(
        baselineWinners,
        group.utilitiesByName,
      );
      if (baselineValue >= group.maxUtility - GAIN_EPSILON) continue;
      const trials = trialsFor(
        method,
        group,
        ballots[group.index].payload,
        includeFptp,
      ).slice(0, MAX_TRIALS_PER_BALLOT);
      if (trials.length === 0) continue;
      queues.push({ group, trials, next: 0, done: false });
    }

    // Round-robin: one trial per group per pass, so a single voter can never
    // consume the whole budget and the most promising trial of every ballot is
    // tried before the second-most promising trial of any.
    let progressed = true;
    while (progressed && !gate.tripped) {
      progressed = false;
      for (const queue of queues) {
        if (queue.done || queue.next >= queue.trials.length) continue;
        progressed = true;

        const payload = queue.trials[queue.next++];
        const trialState = ballots.slice();
        trialState[queue.group.index] = {
          voter_id: queue.group.voterId,
          payload,
        };
        const data = runMethod(gate, method, candidates, trialState, hasIrv);
        if (data === null) break;

        const winners = winnersOf(data);
        const gain =
          outcomeUtility(winners, queue.group.utilitiesByName) -
          outcomeUtility(baselineWinners, queue.group.utilitiesByName);
        if (gain > GAIN_EPSILON) {
          // One finding per ballot per method. Trials are ordered strongest
          // first, so this is the sharpest change the generator proposed, not
          // necessarily the largest gain reachable.
          queue.done = true;
          found.push({
            gain,
            opportunity: {
              algorithm: method,
              voter_id: queue.group.voterId,
              payload,
              baseline_winners: baselineWinners,
              winners,
              shared_by: queue.group.size,
            },
          });
        }
      }
    }
  }

  found.sort((a, b) => {
    if (b.gain !== a.gain) return b.gain - a.gain;
    const byMethod =
      METHOD_ORDER.indexOf(a.opportunity.algorithm) -
      METHOD_ORDER.indexOf(b.opportunity.algorithm);
    if (byMethod !== 0) return byMethod;
    return a.opportunity.voter_id < b.opportunity.voter_id ? -1 : 1;
  });

  return {
    opportunities: found.map((entry) => entry.opportunity),
    algorithms_searched: searched,
    distinct_ballots: groups.length,
    ballots_examined: searchable.reduce((sum, group) => sum + group.size, 0),
    tabulations_used: gate.used,
    budget,
    budget_exhausted: gate.tripped,
  };
}

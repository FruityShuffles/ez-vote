import type { Payload } from '@shared/derive'

import type { ResultData } from '@/lib/results'

// Domain types and phrasing for the what-if explorer (M21), mirroring the
// `simulate-counterfactual` contract in `docs/Backend/Simulate Counterfactual.md`.
// The endpoint is read-only by construction — it holds no service-role key — so
// nothing on this surface can write to an election.

/** One algorithm's tabulation. Lighter than `ElectionResult`: the simulation is computed, never stored, so there are no row ids or timestamps. */
export interface TabulationResult {
  algorithm: string
  result_data: ResultData
}

/** A hypothetical change to the ballot set. Keyed by `voter_id`, never list index. */
export type BallotOverride =
  | { op: 'replace'; voter_id: string; payload: Payload }
  | { op: 'remove'; voter_id: string }
  | { op: 'add'; payload: Payload }

export interface SimulationResponse {
  election_id: string
  baseline: TabulationResult[]
  simulated: TabulationResult[]
  /** Per algorithm: did the winners array change (positionally)? */
  changed: Record<string, boolean>
  ballot_count: { baseline: number; simulated: number }
  applied: { replace: number; remove: number; add: number }
}

/**
 * What each method actually reads off a ballot. This is the educational spine of
 * the rail: when a score edit moves STAR and nothing else, the label has already
 * explained why. Keep these phrased as what the *voter* did, not as payload keys.
 */
export const ALGORITHM_READS: Record<string, string> = {
  approval: 'reads your approvals',
  irv: 'reads your full ranking',
  star: 'reads your 0–5 scores',
  fptp: 'reads your top pick only',
}

/** Short method names — the rail is narrow, so no "(IRV)"-style expansions. */
export const ALGORITHM_SHORT_LABELS: Record<string, string> = {
  approval: 'Approval',
  irv: 'IRV',
  star: 'STAR',
  fptp: 'FPTP',
}

/** The headline number each method is judged on, and what to call it. */
export const ALGORITHM_METRIC_LABELS: Record<string, string> = {
  approval: 'Approvals',
  irv: 'First preferences',
  star: 'Score totals',
  fptp: 'Votes',
}

/**
 * The comparable per-candidate numbers for one algorithm.
 *
 * IRV uses **round 1** rather than the final round on purpose: eliminations mean
 * the final round holds a different candidate set on each side of the
 * comparison, so final-round deltas would be meaningless. First preferences
 * always cover every candidate, and they are where IRV's non-monotonicity shows
 * up most legibly.
 */
export function metricOf(result: TabulationResult): Record<string, number> {
  const data = result.result_data
  switch (result.algorithm) {
    case 'star':
      return data.scores ?? {}
    case 'irv':
      return data.rounds?.[0]?.counts ?? {}
    default:
      return data.tallies ?? {}
  }
}

/** Number of IRV rounds, or null for methods that don't have rounds. */
export function roundCountOf(result: TabulationResult): number | null {
  return result.algorithm === 'irv' ? (result.result_data.rounds?.length ?? 0) : null
}

/**
 * Why a method's outcome moved while its headline numbers stood still.
 *
 * This is the sharpest lesson the feature has to offer and the easiest to miss:
 * re-ordering a voter's *lower* preferences can flip IRV without shifting a
 * single first preference, which looks like a contradiction unless the rail says
 * otherwise. Approval and FPTP have no such gap — their tallies are the outcome —
 * so they get no note.
 */
export function unmovedMetricNote(algorithm: string): string | null {
  switch (algorithm) {
    case 'irv':
      return 'Same first preferences — the outcome moved on later-round transfers.'
    case 'star':
      return 'Same score totals — the outcome moved in the runoff.'
    default:
      return null
  }
}

/** "Alice", "Alice and Bob", "Alice, Bob and Carol". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * A plain-language statement of how an outcome moved, for a method the endpoint
 * reported as changed. Says what happened rather than labelling it — "Bob wins
 * instead of Alice" beats a "CHANGED" badge with no object.
 */
export function describeOutcomeShift(
  baselineWinners: string[],
  simulatedWinners: string[],
): string {
  const before = joinNames(baselineWinners)
  const after = joinNames(simulatedWinners)

  if (baselineWinners.length === 0) return `${after} wins`
  if (simulatedWinners.length === 0) return 'No winner'

  const wasTie = baselineWinners.length > 1
  const isTie = simulatedWinners.length > 1

  if (!wasTie && isTie) return `Now a tie between ${after}`
  if (wasTie && !isTie) return `${after} now wins outright`
  if (isTie) return `Now tied between ${after}, was ${before}`
  return `${after} wins instead of ${before}`
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { Payload } from '@shared/derive'
import type { FlipSearchResult, FlipTarget } from '@shared/flip'
import type {
  StrategicOpportunity,
  StrategicSearchResult,
} from '@shared/strategy'

import type { ResultData } from '@/lib/results'
import { supabase } from '@/lib/supabase'

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
  /** IRV flip search (#120). Present only when the request set `find_flip`; `useFlipSearch` is the one caller that does. */
  flip?: FlipSearchResult
  /** Strategic voting search (#149). Present only when the request set `find_strategy`; `useStrategySearch` is the one caller that does. */
  strategy?: StrategicSearchResult
}

/** Both precomputed searches for one election, read from a single row. */
export interface StoredSearches {
  flip: FlipSearchResult | null
  strategy: StrategicSearchResult | null
}

// Mirrors of MAX_FLIP_BALLOTS / MAX_FLIP_CANDIDATES in
// `supabase/functions/_shared/flip.ts`, and of MAX_STRATEGY_* in
// `_shared/strategy.ts`. Kept as literals because both modules value-import the
// shared tabulator, which is deliberately confined to lazy routes — importing
// the constants would pull it into the entry bundle.
export const FLIP_MAX_BALLOTS = 500
export const FLIP_MAX_CANDIDATES = 20
export const STRATEGY_MAX_BALLOTS = 500
export const STRATEGY_MAX_CANDIDATES = 20

export const SIMULATION_ACCESS_ERROR =
  'This election could not be found, or you are not a participant.'

async function simulationError(error: unknown): Promise<Error> {
  const context = (error as { context?: Response } | null)?.context
  if (context != null) {
    try {
      const body = (await context.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error.trim() !== '') {
        const message =
          body.error === 'Election not found' ||
          body.error === 'Not a participant'
            ? SIMULATION_ACCESS_ERROR
            : body.error
        return new Error(message)
      }
    } catch {
      // A malformed error body falls through to the single generic fallback.
    }
  }
  return new Error('Could not update the what-if results. Please try again.')
}

/**
 * Debounced, read-only counterfactual tabulation.
 *
 * Query data is kept across override changes so the consequence rail never
 * blanks while a new result is in flight. Callers pass `isFetching` to the
 * rail's `pending` prop to make the stale-but-visible state explicit.
 */
export function useSimulate(
  electionId: string,
  overrides: BallotOverride[],
  enabled = true,
) {
  const [request, setRequest] = useState({ electionId, overrides })

  useEffect(() => {
    const timer = window.setTimeout(
      () => setRequest({ electionId, overrides }),
      250,
    )
    return () => window.clearTimeout(timer)
  }, [electionId, overrides])

  return useQuery({
    queryKey: [
      'simulate-counterfactual',
      request.electionId,
      request.overrides,
    ],
    enabled: enabled && electionId !== '' && request.electionId === electionId,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async (): Promise<SimulationResponse> => {
      const { data, error } = await supabase.functions.invoke(
        'simulate-counterfactual',
        {
          body: {
            election_id: request.electionId,
            overrides: request.overrides,
          },
        },
      )
      if (error) throw await simulationError(error)
      return data as SimulationResponse
    },
  })
}

/**
 * Both searches precomputed at election close and stored in the one
 * `flip_searches` row: the IRV flip search (#146) and the per-method strategic
 * voting search (#149, migration 024).
 *
 * Cheap enough to run unconditionally on the explorer: one primary-key row
 * read. When it returns an answer the panels render immediately and never offer
 * a button — which is the whole point of both features. RLS gates the row on
 * `public_ballots` plus the same owner / joined-voter / public-election set as
 * the ballots themselves (migration 023), so this can only return data the
 * caller could already read.
 *
 * `select('*')` rather than naming the columns: an environment without
 * migration 024 then degrades to a missing `strategy` field instead of a query
 * error that would take the *flip* answer down with it.
 *
 * Resolves both fields to `null` rather than throwing on *any* failure. A
 * missing row, a denied read and a database behind on migrations all mean the
 * same thing to the caller: fall back to the live search.
 */
export function useStoredSearches(electionId: string, enabled = true) {
  return useQuery({
    queryKey: ['counterfactual-search', 'stored', electionId],
    enabled: enabled && electionId !== '',
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<StoredSearches> => {
      const { data, error } = await supabase
        .from('flip_searches')
        .select('*')
        .eq('election_id', electionId)
        .maybeSingle()
      if (error) return { flip: null, strategy: null }
      return {
        flip: (data?.result as FlipSearchResult | undefined) ?? null,
        strategy: (data?.strategy as StrategicSearchResult | undefined) ?? null,
      }
    },
  })
}

/**
 * The live "what would it take to flip the outcome?" search — the **fallback**
 * for elections with no precomputed row: those closed before #146, and those
 * whose owner enabled `public_ballots` after closing. Elections closed since
 * then are answered by `useStoredFlip` without touching this.
 *
 * Deliberately separate from `useSimulate`: the answer depends only on the
 * election's baseline ballots (the server ignores overrides when searching), so
 * folding `find_flip` into the debounced simulate query would rerun a ~500 ms
 * server-side search on every ballot edit and split the cache. The election is
 * closed, so once computed the answer never goes stale.
 *
 * Its query key stays distinct from the stored one so a fallback result can
 * never masquerade as a precomputed one in the cache.
 */
export function useFlipSearch(electionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['flip-search', 'live', electionId],
    enabled: enabled && electionId !== '',
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<FlipSearchResult> => {
      const { data, error } = await supabase.functions.invoke(
        'simulate-counterfactual',
        { body: { election_id: electionId, overrides: [], find_flip: true } },
      )
      if (error) throw await simulationError(error)
      const flip = (data as SimulationResponse).flip
      if (flip == null) {
        throw new Error('Could not run the flip search. Please try again.')
      }
      return flip
    },
  })
}

/**
 * The live strategic voting search — the **fallback** for elections with no
 * precomputed row, exactly as `useFlipSearch` is for the flip answer: elections
 * closed before #149, and those whose owner enabled `public_ballots` after
 * closing.
 *
 * Unlike the flip search this has no algorithm requirement — every method has a
 * strategy space — so the only gate is the input caps.
 */
export function useStrategySearch(electionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['strategy-search', 'live', electionId],
    enabled: enabled && electionId !== '',
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<StrategicSearchResult> => {
      const { data, error } = await supabase.functions.invoke(
        'simulate-counterfactual',
        {
          body: { election_id: electionId, overrides: [], find_strategy: true },
        },
      )
      if (error) throw await simulationError(error)
      const strategy = (data as SimulationResponse).strategy
      if (strategy == null) {
        throw new Error(
          'Could not run the strategic voting search. Please try again.',
        )
      }
      return strategy
    },
  })
}

/**
 * The one-line answer for one strategic voting opportunity — the single place
 * the search's honesty contract becomes copy, as `flipTargetHeadline` is for the
 * flip search.
 *
 * Says only how the WINNER moved, because the winner is the only thing the
 * search treats as an outcome. It deliberately does not name the strategy: the
 * search proved that a different ballot would have served this voter better, not
 * that they meant to be tactical. The ballot change itself is spelled out
 * separately, by `summarizeChange`.
 *
 * Every one of these is a proven claim, so the phrasing is unhedged — the
 * caveat belongs on *absence*, not on a finding.
 */
export function strategyHeadline(
  opportunity: StrategicOpportunity,
  voterName: string,
): string {
  const before = joinNames(opportunity.baseline_winners)
  const after = joinNames(opportunity.winners)
  const wasTie = opportunity.baseline_winners.length > 1
  const isTie = opportunity.winners.length > 1

  if (wasTie && isTie) {
    return `${voterName} could have changed the tie from ${before} to ${after}.`
  }
  if (wasTie) {
    return `${voterName} could have broken the tie between ${before} in ${after}'s favour.`
  }
  if (isTie) {
    return `${voterName} could have turned ${before}'s win into a tie between ${after}.`
  }
  return `${voterName} could have made ${after} win instead of ${before}.`
}

/**
 * The one-line answer for a flip-search target, honest about what the server
 * proved. The search's honesty contract carries through to the copy: `k` is an
 * upper bound, so "smallest possible" appears only when `proven` (k = 1, the
 * sole provable case); `no_flip_found` means the heuristic found nothing, never
 * that no flip exists; and entering a tie is called a tie, never a win.
 */
export function flipTargetHeadline(target: FlipTarget): string {
  const name = target.candidate_name
  switch (target.status) {
    case 'no_flip_found':
      return `No flip found for ${name}. This search can't try every possible change, so a flip may still exist.`
    case 'budget_exhausted':
      return `The search ran out of budget before finishing ${name}.`
  }
  const others = (target.winners ?? []).filter((winner) => winner !== name)
  const outcome =
    others.length > 0
      ? `${name} ties for the IRV win with ${joinNames(others)}`
      : `${name} wins IRV`
  if (target.proven) {
    return `Change 1 ballot and ${outcome} — the smallest possible change.`
  }
  const count = target.k === 1 ? '1 ballot' : `${target.k} ballots`
  return `Best found: change ${count} and ${outcome}. A smaller set may exist.`
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
  return result.algorithm === 'irv'
    ? (result.result_data.rounds?.length ?? 0)
    : null
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

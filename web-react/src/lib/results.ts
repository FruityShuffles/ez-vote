import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

// Domain types for the results surface. `result_data` is produced by the shared
// tabulation helper (`supabase/functions/_shared/tabulate.ts`) and is keyed by
// candidate **name**, not UUID (parity item TAB-06) — the renderer reads names
// directly.

/** One round of an IRV tabulation. `eliminated` is null on the final round. */
export interface IrvRound {
  counts?: Record<string, number>
  eliminated?: string[] | null
}

/**
 * The `result_data` JSONB shape, per algorithm. Every field is optional because
 * which keys are present depends on the algorithm (approval/fptp → `tallies`,
 * irv → `rounds`, star → `scores` + `runoff`); see `docs/Backend/Edge Function.md`.
 */
export interface ResultData {
  winner?: string | null
  winners?: string[]
  runner_up?: string | null
  tallies?: Record<string, number>
  scores?: Record<string, number>
  runoff?: Record<string, number>
  rounds?: IrvRound[]
}

/** A row from the `results` table. */
export interface ElectionResult {
  id: string
  election_id: string
  algorithm: string
  result_data: ResultData
  created_at: string
  updated_at: string
}

/**
 * Canonical algorithm display order (RES-01): always Approval → IRV → STAR →
 * FPTP, with FPTP last. Enforced client-side — never trust DB / insertion order.
 * Ported from `lib/data/repositories/result_repository.dart`.
 */
export const RESULT_ALGORITHM_ORDER = ['approval', 'irv', 'star', 'fptp'] as const

/** Sort results into the canonical order; unknown algorithms sort last. */
export function sortResults(results: ElectionResult[]): ElectionResult[] {
  const rank = (algorithm: string) => {
    const i = RESULT_ALGORITHM_ORDER.indexOf(
      algorithm as (typeof RESULT_ALGORITHM_ORDER)[number],
    )
    return i < 0 ? 999 : i
  }
  return [...results].sort((a, b) => rank(a.algorithm) - rank(b.algorithm))
}

export const resultsQueryKey = (electionId: string) =>
  ['results', electionId] as const

/**
 * Fetch the computed results for an election, in canonical algorithm order.
 * Read-only: RLS already restricts `results` reads to election viewers, so this
 * surface is implicitly auth-gated.
 */
export function useElectionResults(electionId: string) {
  return useQuery({
    queryKey: resultsQueryKey(electionId),
    queryFn: async (): Promise<ElectionResult[]> => {
      const { data, error } = await supabase
        .from('results')
        .select()
        .eq('election_id', electionId)
      if (error) throw error
      return sortResults((data ?? []) as ElectionResult[])
    },
  })
}

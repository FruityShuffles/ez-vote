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

/** Winner names for a result: explicit `winners`, else the single `winner`. */
export function winnersOf(data: ResultData): string[] {
  if (data.winners != null) return data.winners
  return data.winner != null ? [data.winner] : []
}

/**
 * Short winner summary for a closed election across its scored algorithms
 * ("Winner: Alice" / "Tied: Alice & Bob"), or null when nothing is decided.
 * FPTP is excluded — it's a reference comparison, not a scored method. Ported
 * from `_winnersLabel` in `lib/presentation/screens/home_screen.dart`; used on
 * the dashboard election cards.
 */
export function winnersLabel(results: ElectionResult[]): string | null {
  const wins: Record<string, number> = {}
  for (const r of results) {
    if (r.algorithm === 'fptp') continue
    for (const name of winnersOf(r.result_data)) {
      wins[name] = (wins[name] ?? 0) + 1
    }
  }
  const names = Object.keys(wins)
  if (names.length === 0) return null
  const maxWins = Math.max(...names.map((n) => wins[n]))
  const leaders = names.filter((n) => wins[n] === maxWins)
  return leaders.length === 1
    ? `Winner: ${leaders[0]}`
    : `Tied: ${leaders.join(' & ')}`
}

export const resultsQueryKey = (electionId: string) =>
  ['results', electionId] as const

/**
 * Fetch the computed results for an election, in canonical algorithm order.
 * Read-only: RLS already restricts `results` reads to election viewers, so this
 * surface is implicitly auth-gated.
 */
export function useElectionResults(
  electionId: string,
  options?: { enabled?: boolean },
) {
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
    // Lets the dashboard cards skip the fetch for non-closed elections, which
    // have no results yet (parity with Flutter watching `resultsProvider` only
    // when closed). Undefined ⇒ enabled, so the M8 results view is unaffected.
    enabled: options?.enabled,
  })
}

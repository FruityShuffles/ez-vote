import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { electionKeys, type Ballot, type Candidate } from '@/lib/elections'
import type { Payload } from '@shared/derive'

// Data layer for the ballot / voting flow (M10), ported from Flutter's
// `BallotRepository` + the ballot screen's submit path. Mirrors `elections.ts`:
// TanStack Query owns server state, rows are snake_case, the schema/RPC contract
// is unchanged. Derivation itself lives in `@shared/derive` (M23) — this module
// only handles I/O.

/** Fetch the full candidate list (sorted by `position`) outside the query cache. */
export async function fetchCandidates(
  electionId: string,
): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('candidates')
    .select()
    .eq('election_id', electionId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as Candidate[]
}

/** Cheap count-only read used to poll for ad-hoc candidate changes (BAL-10). */
export async function fetchCandidateCount(electionId: string): Promise<number> {
  const { count, error } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('election_id', electionId)
  if (error) throw error
  return count ?? 0
}

/**
 * Poll the candidate count for ad-hoc elections. Disabled unless the election
 * allows voter candidates and is open; refetches every 10s, matching the Flutter
 * ballot-screen poll (the realtime upgrade is M15). The full list is fetched
 * only when the count actually changes, by the consumer.
 */
export function useCandidateCount(
  electionId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['candidate-count', electionId] as const,
    queryFn: () => fetchCandidateCount(electionId),
    enabled: options?.enabled,
    refetchInterval: options?.enabled ? 10_000 : false,
  })
}

/**
 * Upsert the current user's ballot for this election. The conflict target
 * `(election_id, voter_id)` matches the Flutter repository, so re-voting updates
 * the same row. `updated_at` is never sent — Postgres sets it server-side
 * (BAL-14) — and is read back from the returned row so the local model carries
 * the authoritative timestamp (drives the DET-06 stale-ballot warning).
 */
export function useUpsertBallot(electionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Payload): Promise<Ballot> => {
      const { data: userData, error: userError } =
        await supabase.auth.getUser()
      if (userError) throw userError
      if (!userData.user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('ballots')
        .upsert(
          {
            election_id: electionId,
            voter_id: userData.user.id,
            payload,
          },
          { onConflict: 'election_id,voter_id' },
        )
        .select()
        .single()
      if (error) throw error
      return data as Ballot
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: electionKeys.existingBallot(electionId) })
      qc.invalidateQueries({ queryKey: electionKeys.ballotCount(electionId) })
      qc.invalidateQueries({ queryKey: electionKeys.voted })
    },
  })
}

/**
 * Order-insensitive (for object keys) deep equality for ballot payloads, used to
 * skip the realtime recompute when a re-submitted ballot is unchanged (BAL-13).
 * Array order is significant (it carries IRV ranking); object key order is not.
 */
export function payloadsEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

/**
 * Fire-and-forget realtime tabulation after a ballot is saved in a
 * `realtime_results` election. Non-blocking and best-effort: a failure here must
 * never fail the vote (parity with Flutter, which swallows the error). Callers
 * skip this entirely when the payload was byte-identical to the stored one
 * (BAL-13).
 */
export async function triggerRealtimeCompute(electionId: string): Promise<void> {
  try {
    await supabase.functions.invoke('compute-results', {
      body: { election_id: electionId, close: false },
    })
  } catch {
    // Best-effort: realtime results will simply lag until the next compute.
  }
}

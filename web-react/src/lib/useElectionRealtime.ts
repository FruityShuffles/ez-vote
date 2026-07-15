import { useEffect, useRef, type MutableRefObject } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

import { electionKeys, type Candidate, type Election } from '@/lib/elections'
import { fetchCandidateCount } from '@/lib/ballot'
import { fetchResultsUpdatedAt, resultsQueryKey } from '@/lib/results'

// Realtime updates for the election detail surface (M15), ported from the
// `Timer.periodic(10s)` poll in Flutter's `ElectionDetailScreen._poll`
// (lib/presentation/screens/election_detail_screen.dart). We poll rather than
// subscribe to Supabase Realtime channels: polling needs no backend change
// (publication + REPLICA IDENTITY) and is mechanism-identical to the frozen
// Flutter reference, which keeps the M18 side-by-side diff honest. Migrating to
// Realtime channels is tracked as a post-cutover follow-up.
//
// The poll only ever reads cheap timestamps/counts and invalidates the heavier
// TanStack queries when something actually changed (RTM-06); the event is a
// signal to refetch, never the source of truth.

const POLL_INTERVAL_MS = 10_000

export interface RealtimePollDeps {
  qc: QueryClient
  electionId: string
  /** Guards against overlapping polls dropping an update (RTM-02, #66). */
  inFlight: MutableRefObject<boolean>
  /** Last-seen `results.updated_at`; starts null so a first-interval change is
   *  not missed (RTM-01, the #82 "seeds but doesn't invalidate" trap). */
  lastResultsUpdatedAt: MutableRefObject<string | null>
  fetchResultsUpdatedAt: (id: string) => Promise<string | null>
  fetchCandidateCount: (id: string) => Promise<number>
}

/**
 * One poll tick. Pure w.r.t. its injected I/O so it unit-tests with a real
 * QueryClient (spying `invalidateQueries`) and mocked fetchers. Mirrors
 * `_poll()` field-for-field.
 */
export async function runRealtimePoll(deps: RealtimePollDeps): Promise<void> {
  const { qc, electionId, inFlight, lastResultsUpdatedAt } = deps

  if (inFlight.current) return // RTM-02: skip while a poll is already running
  inFlight.current = true
  try {
    const detailKey = electionKeys.detail(electionId)

    // RTM-03 (#67): if the election query is in error, kick a refetch and bail
    // — don't poll against a stale/empty cache.
    if (qc.getQueryState(detailKey)?.status === 'error') {
      void qc.invalidateQueries({ queryKey: detailKey })
      return
    }

    const election = qc.getQueryData<Election>(detailKey)
    if (!election || election.status !== 'open') return

    // Ad-hoc candidate changes: compare a cheap count against the cached list.
    if (election.allow_voter_candidates) {
      const freshCount = await deps.fetchCandidateCount(electionId)
      const cached = qc.getQueryData<Candidate[]>(
        electionKeys.candidates(electionId),
      )
      if (cached && freshCount !== cached.length) {
        void qc.invalidateQueries({ queryKey: electionKeys.candidates(electionId) })
        // Bump the election too so `candidates_updated_at` is current and the
        // stale-ballot warning (DET-06) fires for voters who already voted.
        void qc.invalidateQueries({ queryKey: detailKey })
      }
    }

    // Realtime results: invalidate the dependent surfaces only when the latest
    // results timestamp actually changed (RTM-01/05/06).
    if (election.realtime_results) {
      const fresh = await deps.fetchResultsUpdatedAt(electionId)
      if (fresh != null && fresh !== lastResultsUpdatedAt.current) {
        void qc.invalidateQueries({ queryKey: resultsQueryKey(electionId) })
        void qc.invalidateQueries({ queryKey: electionKeys.ballotCount(electionId) })
        void qc.invalidateQueries({ queryKey: electionKeys.voters(electionId) })
        void qc.invalidateQueries({ queryKey: electionKeys.pendingInvitees(electionId) })
        void qc.invalidateQueries({ queryKey: electionKeys.publicBallots(electionId) })
      }
      lastResultsUpdatedAt.current = fresh
    }
  } catch {
    // RTM-03: swallow transient fetch failures. The interval keeps running and
    // the baseline is unchanged, so the next tick recovers on its own.
  } finally {
    inFlight.current = false
  }
}

/**
 * Drive {@link runRealtimePoll} on a 10s interval while the detail surface is
 * mounted. No-ops unless the election is open and has a live-updating surface
 * (realtime results or ad-hoc candidates). Safe to call unconditionally with an
 * undefined election (loading/error states).
 */
export function useElectionRealtime(election: Election | undefined): void {
  const qc = useQueryClient()
  const inFlight = useRef(false)
  const lastResultsUpdatedAt = useRef<string | null>(null)

  const electionId = election?.id
  const status = election?.status
  const realtimeResults = election?.realtime_results
  const allowVoterCandidates = election?.allow_voter_candidates

  useEffect(() => {
    if (!electionId || status !== 'open') return
    if (!realtimeResults && !allowVoterCandidates) return

    // Don't seed from a mount-time fetch — a null baseline guarantees the first
    // detected timestamp counts as a change (RTM-01).
    lastResultsUpdatedAt.current = null

    const timer = setInterval(() => {
      void runRealtimePoll({
        qc,
        electionId,
        inFlight,
        lastResultsUpdatedAt,
        fetchResultsUpdatedAt,
        fetchCandidateCount,
      })
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [qc, electionId, status, realtimeResults, allowVoterCandidates])
}

import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { runRealtimePoll, type RealtimePollDeps } from '@/lib/useElectionRealtime'
import { electionKeys, type Candidate, type Election } from '@/lib/elections'
import { resultsQueryKey } from '@/lib/results'

// M15 realtime poll. We exercise `runRealtimePoll` directly against a real
// QueryClient (spying `invalidateQueries`) with injected fetchers, which covers
// the parity guarantees without timers or Supabase. RTM-07 (non-blocking
// compute after submit) lives in the M10 ballot flow and is covered there.

const ID = 'e1'

type ResultsFetcher = Mock<(id: string) => Promise<string | null>>
type CountFetcher = Mock<(id: string) => Promise<number>>

const okResults = (v: string | null): ResultsFetcher =>
  vi.fn<(id: string) => Promise<string | null>>().mockResolvedValue(v)
const failResults = (): ResultsFetcher =>
  vi.fn<(id: string) => Promise<string | null>>().mockRejectedValue(new Error('net'))
const okCount = (n: number): CountFetcher =>
  vi.fn<(id: string) => Promise<number>>().mockResolvedValue(n)

const OPEN_REALTIME: Election = {
  id: ID,
  owner_id: 'owner-1',
  title: 'T',
  description: null,
  status: 'open',
  algorithms: ['approval'],
  invite_mode: 'invite',
  allow_voter_candidates: false,
  realtime_results: true,
  include_fptp: true,
  public_ballots: false,
  candidates_updated_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function cand(i: number): Candidate {
  return {
    id: `c-${i}`,
    election_id: ID,
    name: `C${i}`,
    position: i,
    created_at: '2026-01-01T00:00:00Z',
  }
}

interface Harness {
  qc: QueryClient
  spy: ReturnType<typeof vi.spyOn>
  deps: RealtimePollDeps
  fetchResultsUpdatedAt: ResultsFetcher
  fetchCandidateCount: CountFetcher
  invalidatedKeys: () => string[]
}

function harness(
  election: Election | undefined,
  over: { fetchResultsUpdatedAt?: ResultsFetcher; fetchCandidateCount?: CountFetcher } = {},
): Harness {
  const qc = new QueryClient()
  if (election) qc.setQueryData(electionKeys.detail(ID), election)
  const spy = vi.spyOn(qc, 'invalidateQueries')

  const fetchResultsUpdatedAt = over.fetchResultsUpdatedAt ?? okResults(null)
  const fetchCandidateCount = over.fetchCandidateCount ?? okCount(0)

  const deps: RealtimePollDeps = {
    qc,
    electionId: ID,
    inFlight: { current: false },
    lastResultsUpdatedAt: { current: null },
    fetchResultsUpdatedAt,
    fetchCandidateCount,
  }

  return {
    qc,
    spy,
    deps,
    fetchResultsUpdatedAt,
    fetchCandidateCount,
    invalidatedKeys: () =>
      spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey)),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('runRealtimePoll', () => {
  it('RTM-01: invalidates result-dependent queries on the first detected timestamp', async () => {
    const h = harness(OPEN_REALTIME, {
      fetchResultsUpdatedAt: okResults('2026-02-01T00:00:00Z'),
    })
    await runRealtimePoll(h.deps)

    const keys = h.invalidatedKeys()
    expect(keys).toContain(JSON.stringify(resultsQueryKey(ID)))
    expect(keys).toContain(JSON.stringify(electionKeys.ballotCount(ID)))
    expect(keys).toContain(JSON.stringify(electionKeys.voters(ID)))
    expect(keys).toContain(JSON.stringify(electionKeys.publicBallots(ID)))
    expect(keys).toContain(JSON.stringify(electionKeys.pendingInvitees(ID)))
    expect(h.deps.lastResultsUpdatedAt.current).toBe('2026-02-01T00:00:00Z')
  })

  it('RTM-04: never invalidates the invite dialog query, so an open search field is undisturbed', async () => {
    // The focus-theft guarantee in React rests on the poll leaving the invite
    // dialog's own data (prior co-voters) alone — it's portaled, so a refetch of
    // *its* query would be what could blur the search input. Asserting the key
    // set is the deterministic proof; the live focus scenario is M18 manual QA.
    const h = harness(
      { ...OPEN_REALTIME, allow_voter_candidates: true },
      {
        fetchResultsUpdatedAt: okResults('2026-02-01T00:00:00Z'),
        fetchCandidateCount: okCount(5),
      },
    )
    h.qc.setQueryData(electionKeys.candidates(ID), [cand(0)])
    h.spy.mockClear()

    await runRealtimePoll(h.deps)

    expect(h.invalidatedKeys()).not.toContain(
      JSON.stringify(electionKeys.priorCovoters(ID)),
    )
  })

  it('RTM-02: skips entirely while a poll is already in flight', async () => {
    const h = harness(OPEN_REALTIME, {
      fetchResultsUpdatedAt: okResults('2026-02-01T00:00:00Z'),
    })
    h.deps.inFlight.current = true
    await runRealtimePoll(h.deps)

    expect(h.fetchResultsUpdatedAt).not.toHaveBeenCalled()
    expect(h.spy).not.toHaveBeenCalled()
  })

  it('RTM-03: refetches and exits when the election query is in error', async () => {
    const h = harness(undefined, {
      fetchResultsUpdatedAt: okResults('2026-02-01T00:00:00Z'),
    })
    // Force the detail query into an error state.
    await h.qc.prefetchQuery({
      queryKey: electionKeys.detail(ID),
      queryFn: () => Promise.reject(new Error('boom')),
      retry: false,
    })
    h.spy.mockClear()

    await runRealtimePoll(h.deps)

    expect(h.invalidatedKeys()).toEqual([JSON.stringify(electionKeys.detail(ID))])
    expect(h.fetchResultsUpdatedAt).not.toHaveBeenCalled()
  })

  it('RTM-03: swallows a transient fetch error without throwing or moving the baseline', async () => {
    const h = harness(OPEN_REALTIME, { fetchResultsUpdatedAt: failResults() })
    await expect(runRealtimePoll(h.deps)).resolves.toBeUndefined()
    expect(h.deps.lastResultsUpdatedAt.current).toBeNull()
    expect(h.deps.inFlight.current).toBe(false)
  })

  it('RTM-06: does not invalidate when the results timestamp is unchanged', async () => {
    const h = harness(OPEN_REALTIME, {
      fetchResultsUpdatedAt: okResults('2026-02-01T00:00:00Z'),
    })
    h.deps.lastResultsUpdatedAt.current = '2026-02-01T00:00:00Z'
    await runRealtimePoll(h.deps)

    expect(h.spy).not.toHaveBeenCalled()
  })

  it('skips a closed election', async () => {
    const h = harness(
      { ...OPEN_REALTIME, status: 'closed' },
      { fetchResultsUpdatedAt: okResults('2026-02-01T00:00:00Z') },
    )
    await runRealtimePoll(h.deps)
    expect(h.fetchResultsUpdatedAt).not.toHaveBeenCalled()
    expect(h.spy).not.toHaveBeenCalled()
  })

  it('invalidates candidates + election when the ad-hoc candidate count changes', async () => {
    const h = harness(
      { ...OPEN_REALTIME, realtime_results: false, allow_voter_candidates: true },
      { fetchCandidateCount: okCount(2) },
    )
    h.qc.setQueryData(electionKeys.candidates(ID), [cand(0)]) // cached length 1 ≠ 2
    h.spy.mockClear()

    await runRealtimePoll(h.deps)

    const keys = h.invalidatedKeys()
    expect(keys).toContain(JSON.stringify(electionKeys.candidates(ID)))
    expect(keys).toContain(JSON.stringify(electionKeys.detail(ID)))
  })

  it('does not invalidate when the candidate count is unchanged', async () => {
    const h = harness(
      { ...OPEN_REALTIME, realtime_results: false, allow_voter_candidates: true },
      { fetchCandidateCount: okCount(1) },
    )
    h.qc.setQueryData(electionKeys.candidates(ID), [cand(0)]) // length 1 === 1
    h.spy.mockClear()

    await runRealtimePoll(h.deps)
    expect(h.spy).not.toHaveBeenCalled()
  })
})

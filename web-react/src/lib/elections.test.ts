import type { ReactNode } from 'react'
import { createElement } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildCandidateRows,
  CANDIDATES_STALE_TIME_MS,
  ELECTION_STALE_TIME_MS,
  electionKeys,
  useAddVoterToElection,
  useCaseStudies,
  useCandidates,
  useElection,
  useElectionParticipation,
  usePriorCovoters,
} from '@/lib/elections'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))

describe('CRT-01 - candidate persistence order', () => {
  it('assigns explicit zero-based positions in form order', () => {
    expect(buildCandidateRows('e1', ['Charlie', 'Alice', 'Bob'])).toEqual([
      { election_id: 'e1', name: 'Charlie', position: 0 },
      { election_id: 'e1', name: 'Alice', position: 1 },
      { election_id: 'e1', name: 'Bob', position: 2 },
    ])
  })
})

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.from.mockReset()
})

describe('election route freshness', () => {
  it('reuses fresh election and candidate data across observer remounts', async () => {
    const election = {
      id: 'e1',
      owner_id: 'owner',
      title: 'Fresh election',
    }
    const candidates = [{ id: 'c1', election_id: 'e1', name: 'Ada', position: 0 }]
    const electionSingle = vi.fn().mockResolvedValue({ data: election, error: null })
    const candidateOrder = vi
      .fn()
      .mockResolvedValue({ data: candidates, error: null })

    mocks.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () =>
          table === 'elections'
            ? { single: electionSingle }
            : { order: candidateOrder },
      }),
    }))

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const useElectionRouteData = () => ({
      election: useElection('e1'),
      candidates: useCandidates('e1'),
    })

    const first = renderHook(useElectionRouteData, { wrapper: wrapper(qc) })
    await waitFor(() => {
      expect(first.result.current.election.isSuccess).toBe(true)
      expect(first.result.current.candidates.isSuccess).toBe(true)
    })
    first.unmount()

    const second = renderHook(useElectionRouteData, { wrapper: wrapper(qc) })
    await waitFor(() => {
      expect(second.result.current.election.data).toEqual(election)
      expect(second.result.current.candidates.data).toEqual(candidates)
    })

    expect(mocks.from).toHaveBeenCalledTimes(2)
    expect(ELECTION_STALE_TIME_MS).toBe(30_000)
    expect(CANDIDATES_STALE_TIME_MS).toBe(30_000)
  })
})

describe('public election reads', () => {
  it('lists showcase elections newest first without an auth lookup', async () => {
    const studies = [{ id: 'study-1', showcase: true }]
    const order = vi.fn().mockResolvedValue({ data: studies, error: null })
    const eqShowcase = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq: eqShowcase })
    mocks.from.mockReturnValue({ select })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useCaseStudies(), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.from).toHaveBeenCalledWith('elections')
    expect(eqShowcase).toHaveBeenCalledWith('showcase', true)
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.current.data).toEqual(studies)
  })

  it('detects joined membership separately from ballot status', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'viewer-1' },
      error: null,
    })
    const eqUser = vi.fn().mockReturnValue({ maybeSingle })
    const eqElection = vi.fn().mockReturnValue({ eq: eqUser })
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqElection }),
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(
      () => useElectionParticipation('e1', 'viewer-1'),
      { wrapper: wrapper(qc) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.from).toHaveBeenCalledWith('election_voters')
    expect(eqElection).toHaveBeenCalledWith('election_id', 'e1')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'viewer-1')
    expect(result.current.data).toBe(true)
  })
})

describe('usePriorCovoters - row mapping', () => {
  it('maps RPC rows and applies Dart-parity defaults for nulls', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        { user_id: 'u1', display_name: 'Alice', election_count: 3 },
        { user_id: 'u2', display_name: null, election_count: null },
      ],
      error: null,
    })
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => usePriorCovoters('e1'), {
      wrapper: wrapper(qc),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.rpc).toHaveBeenCalledWith('get_prior_covoters', {
      p_election_id: 'e1',
    })
    expect(result.current.data).toEqual([
      { user_id: 'u1', display_name: 'Alice', election_count: 3 },
      // null display_name → '', null election_count → 1
      { user_id: 'u2', display_name: '', election_count: 1 },
    ])
  })
})

describe('useAddVoterToElection - #84 invalidation contract', () => {
  it('invalidates both prior-covoters and pending-invitees on success', async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useAddVoterToElection('e1'), {
      wrapper: wrapper(qc),
    })
    await result.current.mutateAsync('voter-9')

    expect(mocks.rpc).toHaveBeenCalledWith('add_voter_to_election', {
      p_election_id: 'e1',
      p_voter_id: 'voter-9',
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: electionKeys.priorCovoters('e1'),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: electionKeys.pendingInvitees('e1'),
    })
  })
})

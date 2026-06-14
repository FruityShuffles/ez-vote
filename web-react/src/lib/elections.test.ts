import type { ReactNode } from 'react'
import { createElement } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildCandidateRows,
  electionKeys,
  useAddVoterToElection,
  usePriorCovoters,
} from '@/lib/elections'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
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

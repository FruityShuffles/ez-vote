import type { ReactNode } from 'react'
import { createElement } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SIMULATION_ACCESS_ERROR,
  useFlipSearch,
  useSimulate,
  useStoredSearches,
  useStrategySearch,
  type BallotOverride,
  type SimulationResponse,
} from '@/lib/counterfactual'
import type { FlipSearchResult } from '@shared/flip'
import type { StrategicSearchResult } from '@shared/strategy'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), maybeSingle: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
  },
}))

const response: SimulationResponse = {
  election_id: 'e1',
  baseline: [],
  simulated: [],
  changed: {},
  ballot_count: { baseline: 1, simulated: 1 },
  applied: { replace: 0, remove: 0, add: 0 },
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.maybeSingle.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSimulate', () => {
  it('debounces override changes and sends the endpoint contract exactly', async () => {
    vi.useFakeTimers()
    mocks.invoke.mockResolvedValue({ data: response, error: null })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result, rerender } = renderHook(
      ({ overrides }) => useSimulate('e1', overrides),
      {
        initialProps: { overrides: [] as BallotOverride[] },
        wrapper: wrapper(client),
      },
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(result.current.isSuccess).toBe(true)
    expect(mocks.invoke).toHaveBeenLastCalledWith('simulate-counterfactual', {
      body: { election_id: 'e1', overrides: [] },
    })

    const edit = {
      op: 'replace' as const,
      voter_id: 'v1',
      payload: { irv: ['bo', 'ada'] },
    }
    rerender({ overrides: [edit] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249)
    })
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
    expect(mocks.invoke).toHaveBeenLastCalledWith('simulate-counterfactual', {
      body: { election_id: 'e1', overrides: [edit] },
    })
  })

  it('keeps the previous response visible while a changed request is pending', async () => {
    let resolveSecond: ((value: unknown) => void) | undefined
    mocks.invoke
      .mockResolvedValueOnce({ data: response, error: null })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          }),
      )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result, rerender } = renderHook(
      ({ overrides }) => useSimulate('e1', overrides),
      {
        initialProps: { overrides: [] as BallotOverride[] },
        wrapper: wrapper(client),
      },
    )
    await waitFor(() => expect(result.current.data).toEqual(response))

    rerender({
      overrides: [
        {
          op: 'remove' as const,
          voter_id: 'v1',
        },
      ],
    })
    await waitFor(() => expect(result.current.isFetching).toBe(true), {
      timeout: 1_000,
    })
    expect(result.current.data).toEqual(response)

    resolveSecond?.({ data: response, error: null })
  })

  it('surfaces validation text verbatim but hides the access distinction', async () => {
    const context = {
      json: vi
        .fn()
        .mockResolvedValueOnce({ error: 'Duplicate voter override: v1' })
        .mockResolvedValueOnce({ error: 'Election not found' }),
    }
    mocks.invoke
      .mockResolvedValueOnce({ data: null, error: { context } })
      .mockResolvedValueOnce({ data: null, error: { context } })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const first = renderHook(() => useSimulate('e1', []), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(first.result.current.isError).toBe(true))
    expect(first.result.current.error?.message).toBe(
      'Duplicate voter override: v1',
    )
    first.unmount()
    client.clear()

    const second = renderHook(() => useSimulate('missing', []), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(second.result.current.isError).toBe(true))
    expect(second.result.current.error?.message).toBe(SIMULATION_ACCESS_ERROR)
  })
})

const flipResult: FlipSearchResult = {
  algorithms: [
    {
      algorithm: 'irv',
      distance_metric: 'irv_adjacent_transposition',
      baseline_winners: ['Ada'],
      best: 'cand-bo',
      targets: [
        {
          candidate_id: 'cand-bo',
          candidate_name: 'Bo',
          status: 'flipped',
          k: 1,
          proven: true,
          winners: ['Bo'],
          changes: [
            { voter_id: 'v1', payload: { irv: ['bo', 'ada'] }, distance: 1 },
          ],
        },
      ],
    },
  ],
  tabulations_used: 5,
  budget: 400,
  budget_exhausted: false,
}

const strategyResult: StrategicSearchResult = {
  opportunities: [
    {
      algorithm: 'irv',
      voter_id: 'v1',
      payload: { irv: ['bo', 'ada'] },
      baseline_winners: ['Ada'],
      winners: ['Bo'],
      shared_by: 1,
    },
  ],
  algorithms_searched: ['irv'],
  distinct_ballots: 3,
  ballots_examined: 7,
  tabulations_used: 12,
  budget: 300,
  budget_exhausted: false,
}

describe('useStoredSearches', () => {
  it('returns both precomputed answers from one row read', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { result: flipResult, strategy: strategyResult },
      error: null,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useStoredSearches('e1'), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      flip: flipResult,
      strategy: strategyResult,
    })
    // The whole point of #146/#149: no edge function invocation.
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('degrades to a missing strategy on a database without migration 024', async () => {
    // `select('*')` is what buys this: the flip answer survives even though the
    // strategy column does not exist yet.
    mocks.maybeSingle.mockResolvedValue({
      data: { result: flipResult },
      error: null,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useStoredSearches('e1'), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ flip: flipResult, strategy: null })
  })

  it('resolves to nulls when the election has no stored row', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useStoredSearches('e1'), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ flip: null, strategy: null })
  })

  it('resolves to nulls rather than throwing when the read is refused', async () => {
    // A denied read, a missing grant and an environment without migration 023
    // all have to degrade to the live fallback, never to an error state.
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table flip_searches' },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useStoredSearches('e1'), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ flip: null, strategy: null })
    expect(result.current.isError).toBe(false)
  })
})

describe('useStrategySearch', () => {
  it('does nothing until enabled, then sends find_strategy with no overrides', async () => {
    mocks.invoke.mockResolvedValue({
      data: { ...response, strategy: strategyResult },
      error: null,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result, rerender } = renderHook(
      ({ enabled }) => useStrategySearch('e1', enabled),
      { initialProps: { enabled: false }, wrapper: wrapper(client) },
    )

    expect(mocks.invoke).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      'simulate-counterfactual',
      { body: { election_id: 'e1', overrides: [], find_strategy: true } },
    )
    expect(result.current.data).toEqual(strategyResult)
  })

  it('treats a response without a strategy block as an error', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: response, error: null })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useStrategySearch('e1', true), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(
      'Could not run the strategic voting search. Please try again.',
    )
  })
})

describe('useFlipSearch', () => {
  it('does nothing until enabled, then sends find_flip with no overrides', async () => {
    mocks.invoke.mockResolvedValue({
      data: { ...response, flip: flipResult },
      error: null,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result, rerender } = renderHook(
      ({ enabled }) => useFlipSearch('e1', enabled),
      { initialProps: { enabled: false }, wrapper: wrapper(client) },
    )

    expect(mocks.invoke).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(
      'simulate-counterfactual',
      { body: { election_id: 'e1', overrides: [], find_flip: true } },
    )
    expect(result.current.data).toEqual(flipResult)
  })

  it('serves later mounts from cache — the search never reruns', async () => {
    mocks.invoke.mockResolvedValue({
      data: { ...response, flip: flipResult },
      error: null,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const first = renderHook(() => useFlipSearch('e1', true), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    first.unmount()

    const second = renderHook(() => useFlipSearch('e1', true), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })

  it('surfaces the server cap message verbatim', async () => {
    const context = {
      json: vi.fn().mockResolvedValueOnce({
        error: 'too many ballots for flip search (max 500)',
      }),
    }
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { context } })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useFlipSearch('e1', true), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(
      'too many ballots for flip search (max 500)',
    )
  })

  it('treats a response without a flip block as an error', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: response, error: null })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(() => useFlipSearch('e1', true), {
      wrapper: wrapper(client),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(
      'Could not run the flip search. Please try again.',
    )
  })
})

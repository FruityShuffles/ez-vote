import type { ReactNode } from 'react'
import { createElement } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SIMULATION_ACCESS_ERROR,
  useSimulate,
  type BallotOverride,
  type SimulationResponse,
} from '@/lib/counterfactual'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
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

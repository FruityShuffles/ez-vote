import { StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JoinElection } from '@/routes/JoinElection'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutate: vi.fn<(id: string, opts: { onSettled: () => void }) => void>(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock('@/lib/elections', () => ({
  useJoinElection: () => ({ mutate: mocks.mutate }),
}))

function renderAt(strict = false) {
  const tree = (
    <MemoryRouter initialEntries={['/election/e1/join']}>
      <Routes>
        <Route path="/election/:id/join" element={<JoinElection />} />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

beforeEach(() => {
  mocks.navigate.mockReset()
  mocks.mutate.mockReset()
})

describe('JoinElection', () => {
  it('joins the election and forwards to the detail page on settle', async () => {
    // join_election is idempotent; the screen only cares that it settles.
    mocks.mutate.mockImplementation((_id, opts) => opts.onSettled())
    renderAt()

    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    expect(mocks.mutate.mock.calls[0][0]).toBe('e1')
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/election/e1', {
        replace: true,
      }),
    )
  })

  it('fires the join exactly once under StrictMode double-mount', () => {
    renderAt(true)
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
  })
})

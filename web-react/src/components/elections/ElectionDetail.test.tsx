import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { ElectionDetailView } from '@/components/elections/ElectionDetail'
import type { Ballot, Candidate, Election } from '@/lib/elections'

// Parity tests for the election detail surface (M9), parity checklist §3. They
// exercise the presentational `ElectionDetailView` with resolved props so the
// role / status-transition / stale-ballot logic is tested without Supabase. The
// query-driven children (ballot count, results) render their pending state
// (null / spinner) and are out of scope here.

const OWNER = 'owner-1'

const baseElection: Election = {
  id: 'e1',
  owner_id: OWNER,
  title: 'Test Election',
  description: null,
  status: 'open',
  algorithms: ['approval'],
  invite_mode: 'invite',
  allow_voter_candidates: false,
  realtime_results: false,
  include_fptp: true,
  public_ballots: false,
  candidates_updated_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function cand(name: string, position: number): Candidate {
  return {
    id: `c-${position}`,
    election_id: 'e1',
    name,
    position,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function ballotUpdatedAt(updated_at: string): Ballot {
  return {
    id: 'b1',
    election_id: 'e1',
    voter_id: 'voter-1',
    payload: {},
    created_at: updated_at,
    updated_at,
  }
}

type ViewProps = Parameters<typeof ElectionDetailView>[0]

function renderView(over: Partial<ViewProps> = {}) {
  const props: ViewProps = {
    election: baseElection,
    candidates: [],
    candidatesLoading: false,
    candidatesError: false,
    ballot: null,
    currentUserId: null,
    ...over,
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ElectionDetailView {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DET-01 — candidate list in entry order', () => {
  it('renders candidates in position order, not reversed', () => {
    renderView({
      candidates: [cand('Charlie', 0), cand('Alice', 1), cand('Bob', 2)],
    })
    const names = screen
      .getAllByText(/^(Charlie|Alice|Bob)$/)
      .map((el) => el.textContent)
    expect(names).toEqual(['Charlie', 'Alice', 'Bob'])
  })
})

describe('DET-02 — owner-only controls reflect current user', () => {
  it('shows owner controls to the owner', () => {
    renderView({ currentUserId: OWNER })
    expect(
      screen.getByRole('button', { name: /Close & Compute Results/ }),
    ).toBeInTheDocument()
  })

  it('hides owner controls from a participant, who sees voter controls', () => {
    renderView({ currentUserId: 'someone-else' })
    expect(screen.queryByText('Owner Controls')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Close/ }),
    ).not.toBeInTheDocument()
    // A participant on an open election is invited to vote instead.
    expect(
      screen.getByRole('button', { name: /Cast Your Vote/ }),
    ).toBeInTheDocument()
  })
})

describe('status transitions — owner controls by status', () => {
  it('draft shows Edit + Open, not Close', () => {
    renderView({
      election: { ...baseElection, status: 'draft' },
      currentUserId: OWNER,
    })
    expect(
      screen.getByRole('button', { name: 'Edit Election' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open Election' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument()
  })

  it('open shows Close, not Open', () => {
    renderView({ election: { ...baseElection, status: 'open' }, currentUserId: OWNER })
    expect(
      screen.getByRole('button', { name: /Close & Compute Results/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open Election' }),
    ).not.toBeInTheDocument()
  })

  it('open + realtime labels the close button "Close Election"', () => {
    renderView({
      election: { ...baseElection, status: 'open', realtime_results: true },
      currentUserId: OWNER,
    })
    expect(
      screen.getByRole('button', { name: 'Close Election' }),
    ).toBeInTheDocument()
  })

  it('closed shows no owner action buttons', () => {
    renderView({ election: { ...baseElection, status: 'closed' }, currentUserId: OWNER })
    expect(screen.queryByText('Owner Controls')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Close|Open|Edit/ })).not.toBeInTheDocument()
  })
})

describe('voter controls — by ballot + status', () => {
  it('open, no ballot → Cast Your Vote', () => {
    renderView({ currentUserId: 'voter-1' })
    expect(
      screen.getByRole('button', { name: /Cast Your Vote/ }),
    ).toBeInTheDocument()
  })

  it('open, has ballot → Edit Ballot', () => {
    renderView({ currentUserId: 'voter-1', ballot: ballotUpdatedAt('2026-02-01T00:00:00Z') })
    expect(screen.getByRole('button', { name: 'Edit Ballot' })).toBeInTheDocument()
  })

  it('closed, has ballot → View Ballot', () => {
    renderView({
      election: { ...baseElection, status: 'closed' },
      currentUserId: 'voter-1',
      ballot: ballotUpdatedAt('2026-02-01T00:00:00Z'),
    })
    expect(screen.getByRole('button', { name: 'View Ballot' })).toBeInTheDocument()
  })

  it('closed, no ballot → no voter action', () => {
    renderView({ election: { ...baseElection, status: 'closed' }, currentUserId: 'voter-1' })
    expect(screen.queryByRole('button', { name: /Cast Your Vote|Edit Ballot|View Ballot/ })).not.toBeInTheDocument()
  })
})

describe('DET-06 — stale-ballot warning', () => {
  const STALE_MSG = /Candidates have changed since your last vote/

  it('appears when candidates changed after the ballot was saved', () => {
    renderView({
      currentUserId: 'voter-1',
      election: { ...baseElection, candidates_updated_at: '2026-03-01T00:00:00Z' },
      ballot: ballotUpdatedAt('2026-02-01T00:00:00Z'),
    })
    expect(screen.getByText(STALE_MSG)).toBeInTheDocument()
  })

  it('clears once the ballot is re-saved after the candidate change', () => {
    renderView({
      currentUserId: 'voter-1',
      election: { ...baseElection, candidates_updated_at: '2026-03-01T00:00:00Z' },
      ballot: ballotUpdatedAt('2026-03-02T00:00:00Z'),
    })
    expect(screen.queryByText(STALE_MSG)).not.toBeInTheDocument()
  })

  it('never shows on a closed election even if stale', () => {
    renderView({
      currentUserId: 'voter-1',
      election: {
        ...baseElection,
        status: 'closed',
        candidates_updated_at: '2026-03-01T00:00:00Z',
      },
      ballot: ballotUpdatedAt('2026-02-01T00:00:00Z'),
    })
    expect(screen.queryByText(STALE_MSG)).not.toBeInTheDocument()
  })
})

describe('RES-06 — results render above the candidate list', () => {
  it('places Live Results before the Candidates section', () => {
    renderView({
      currentUserId: 'voter-1',
      election: { ...baseElection, status: 'open', realtime_results: true },
      candidates: [cand('Alice', 0)],
      ballot: ballotUpdatedAt('2026-02-01T00:00:00Z'),
    })
    const results = screen.getByText('Live Results')
    const candidates = screen.getByText(/^Candidates \(/)
    expect(
      results.compareDocumentPosition(candidates) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('status badge', () => {
  it('renders the uppercased status', () => {
    renderView({ election: { ...baseElection, status: 'draft' } })
    expect(screen.getByText('DRAFT')).toBeInTheDocument()
  })
})

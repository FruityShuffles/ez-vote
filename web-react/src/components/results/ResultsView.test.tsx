/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ResultsList } from '@/components/results/ResultsView'
import { sortResults, winnersLabel } from '@/lib/results'
import type { ElectionResult } from '@/lib/results'

// Parity tests for the M8 results view (parity checklist §2: RES-01…RES-04,
// plus TAB-03 rendering). They are driven by the **M2 golden corpus**: each
// fixture's `expected` array is exactly the `results` rows' `result_data`, so
// rendering it and asserting the output is a direct Flutter-parity check.

// Vitest runs with cwd = web-react/; the shared corpus lives one level up.
const fixturesDir = resolve(process.cwd(), '../supabase/functions/_shared/fixtures')

interface Fixture {
  expected: Array<{ algorithm: string; result_data: ElectionResult['result_data'] }>
}

/** Load a golden fixture and map its `expected` to `ElectionResult[]`. */
function loadResults(category: 'synthetic' | 'historical', name: string): ElectionResult[] {
  const raw = readFileSync(resolve(fixturesDir, category, `${name}.json`), 'utf8')
  const fixture = JSON.parse(raw) as Fixture
  return fixture.expected.map((entry, i) => ({
    id: `${name}-${i}`,
    election_id: name,
    algorithm: entry.algorithm,
    result_data: entry.result_data,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))
}

/** Synthesize a minimal result row for cases not covered by a fixture. */
function makeResult(
  algorithm: string,
  result_data: ElectionResult['result_data'],
): ElectionResult {
  return {
    id: algorithm,
    election_id: 'test',
    algorithm,
    result_data,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('sortResults — RES-01 canonical order', () => {
  it('orders Approval → IRV → STAR → FPTP regardless of input order', () => {
    const shuffled = ['fptp', 'star', 'irv', 'approval'].map((a) => makeResult(a, {}))
    expect(sortResults(shuffled).map((r) => r.algorithm)).toEqual([
      'approval',
      'irv',
      'star',
      'fptp',
    ])
  })

  it('sorts unknown algorithms last', () => {
    const results = ['mystery', 'fptp', 'approval'].map((a) => makeResult(a, {}))
    expect(sortResults(results).map((r) => r.algorithm)).toEqual([
      'approval',
      'fptp',
      'mystery',
    ])
  })
})

describe('winnersLabel — dashboard card summary', () => {
  it('labels a single overall winner, excluding FPTP', () => {
    const results = [
      makeResult('approval', { winner: 'Alice', winners: ['Alice'] }),
      makeResult('irv', { winner: 'Alice', winners: ['Alice'] }),
      makeResult('fptp', { winner: 'Bob', winners: ['Bob'] }),
    ]
    expect(winnersLabel(results)).toBe('Winner: Alice')
  })

  it('joins a tie across methods with " & "', () => {
    const results = [
      makeResult('approval', { winners: ['Alice'] }),
      makeResult('irv', { winners: ['Bob'] }),
    ]
    expect(winnersLabel(results)).toBe('Tied: Alice & Bob')
  })

  it('returns null when there are no scored winners', () => {
    expect(winnersLabel([makeResult('fptp', { winner: 'Bob' })])).toBeNull()
    expect(winnersLabel([])).toBeNull()
  })
})

describe('ResultsList — empty / single', () => {
  it('shows a placeholder when there are no results', () => {
    render(<ResultsList results={[]} />)
    expect(screen.getByText('No results computed yet.')).toBeInTheDocument()
  })

  it('renders the algorithm label as a heading', () => {
    render(<ResultsList results={loadResults('synthetic', 'approval-tie')} />)
    expect(screen.getByText('Approval Voting')).toBeInTheDocument()
  })
})

describe('RES-01 — rendered order follows the canonical sort', () => {
  it('renders algorithm cards in canonical order', () => {
    const results = sortResults(loadResults('synthetic', 'combined-multi-algorithm'))
    render(<ResultsList results={results} />)
    const headings = screen
      .getAllByText(/Voting|First Past The Post/)
      .map((el) => el.textContent)
    expect(headings).toEqual([
      'Approval Voting',
      'Instant Runoff Voting (IRV)',
      'First Past The Post (FPTP)',
    ])
  })
})

describe('RES-02 — full result_data rendered field-by-field', () => {
  it('renders IRV rounds, counts, and eliminations (and no eliminated line on the final round)', () => {
    render(<ResultsList results={loadResults('synthetic', 'irv-multi-elimination-tie')} />)
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Round 2')).toBeInTheDocument()
    expect(screen.getByText('Alice: 4')).toBeInTheDocument()
    expect(screen.getByText('Carol: 1')).toBeInTheDocument()
    // First round eliminates the two tied-for-last simultaneously (TAB-02).
    expect(screen.getByText('Eliminated: Carol, Dave')).toBeInTheDocument()
    // Exactly one "Eliminated:" line — the final round carries none.
    expect(screen.getAllByText(/^Eliminated:/)).toHaveLength(1)
  })

  it('renders STAR score totals and the runoff', () => {
    render(<ResultsList results={loadResults('synthetic', 'star-basic-runoff')} />)
    expect(screen.getByText('Score Totals:')).toBeInTheDocument()
    expect(screen.getByText('Alice: 15')).toBeInTheDocument()
    expect(screen.getByText('Runoff:')).toBeInTheDocument()
    expect(screen.getByText('Alice: 3 preferences')).toBeInTheDocument()
    expect(screen.getByText('Bob: 1 preferences')).toBeInTheDocument()
  })

  it('renders Approval tallies', () => {
    render(<ResultsList results={loadResults('synthetic', 'approval-tie')} />)
    expect(screen.getByText('Approval Counts:')).toBeInTheDocument()
    expect(screen.getByText('Alice: 2')).toBeInTheDocument()
    expect(screen.getByText('Carol: 1')).toBeInTheDocument()
  })
})

describe('RES-03 — ties shown as co-equals', () => {
  it('joins tied winners with " & " and does not promote one', () => {
    render(<ResultsList results={loadResults('synthetic', 'approval-tie')} />)
    expect(screen.getByText('Tied: Alice & Bob')).toBeInTheDocument()
    expect(screen.queryByText(/^Winner:/)).not.toBeInTheDocument()
    // Runner-up still shown when it isn't itself a winner.
    expect(screen.getByText('Runner-up: Carol')).toBeInTheDocument()
  })
})

describe('TAB-03 — multi-elimination IRV runner_up rendered as stored', () => {
  it('renders the " & "-joined runner_up string verbatim', () => {
    const results = loadResults('synthetic', 'fptp-irv-fallback')
    render(<ResultsList results={sortResults(results)} />)
    const irvCard = screen.getByText('Instant Runoff Voting (IRV)').closest('[data-slot="card"]')
    expect(irvCard).not.toBeNull()
    expect(within(irvCard as HTMLElement).getByText('Runner-up: Bob & Carol')).toBeInTheDocument()
  })
})

describe('RES-04 — overall winner card', () => {
  it('shows the overall majority winner when one candidate wins most methods', () => {
    const results = loadResults('synthetic', 'combined-multi-algorithm')
    render(<ResultsList results={sortResults(results)} />)
    // Bob wins approval (tied) + irv → 2 of 2 scored methods (FPTP excluded).
    expect(screen.getByText('Overall Majority Winner')).toBeInTheDocument()
    const card = screen.getByText('Overall Majority Winner').closest('[data-slot="card"]')
    expect(within(card as HTMLElement).getByText('Bob')).toBeInTheDocument()
    expect(
      within(card as HTMLElement).getByText('Bob won 2 of 2 algorithms'),
    ).toBeInTheDocument()
  })

  it('hides the overall card on a two-way split (no clear leader)', () => {
    const results = [
      makeResult('approval', { winners: ['Alice'], winner: 'Alice', tallies: { Alice: 3 } }),
      makeResult('irv', { winners: ['Bob'], winner: 'Bob', rounds: [] }),
    ]
    render(<ResultsList results={results} />)
    expect(screen.queryByText(/^Overall/)).not.toBeInTheDocument()
  })

  it('does not render the overall card for a single result', () => {
    render(<ResultsList results={loadResults('synthetic', 'star-basic-runoff')} />)
    expect(screen.queryByText(/^Overall/)).not.toBeInTheDocument()
  })
})

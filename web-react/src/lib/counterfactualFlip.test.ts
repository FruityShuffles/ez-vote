import { describe, expect, it } from 'vitest'

import { flipTargetHeadline } from '@/lib/counterfactual'
import type { FlipTarget } from '@shared/flip'

// The headline copy is the UI half of the server's honesty contract
// (docs/Backend/Simulate Counterfactual.md): minimality may only be claimed
// when proven, absence of an answer is never presented as impossibility, and a
// tie is never called a win.

function target(partial: Partial<FlipTarget>): FlipTarget {
  return {
    candidate_id: 'cand-c',
    candidate_name: 'Carol',
    status: 'flipped',
    k: 1,
    proven: true,
    winners: ['Carol'],
    changes: [{ voter_id: 'v1', payload: { irv: ['c'] }, distance: 1 }],
    ...partial,
  }
}

describe('flipTargetHeadline', () => {
  it('claims minimality for a proven outright win', () => {
    expect(flipTargetHeadline(target({}))).toBe(
      'Change 1 ballot and Carol wins IRV — the smallest possible change.',
    )
  })

  it('calls a proven multi-winner outcome a tie, never a win', () => {
    const headline = flipTargetHeadline(
      target({ winners: ['Ada', 'Carol'] }),
    )
    expect(headline).toBe(
      'Change 1 ballot and Carol ties for the IRV win with Ada — the smallest possible change.',
    )
    expect(headline).not.toContain('Carol wins')
  })

  it('presents an unproven answer as best found, never minimum', () => {
    const headline = flipTargetHeadline(
      target({ k: 3, proven: false, winners: ['Carol'] }),
    )
    expect(headline).toBe(
      'Best found: change 3 ballots and Carol wins IRV. A smaller set may exist.',
    )
    expect(headline).not.toMatch(/minimum|smallest/i)
  })

  it('handles an unproven tie with multiple co-winners', () => {
    expect(
      flipTargetHeadline(
        target({ k: 2, proven: false, winners: ['Ada', 'Bo', 'Carol'] }),
      ),
    ).toBe(
      'Best found: change 2 ballots and Carol ties for the IRV win with Ada and Bo. A smaller set may exist.',
    )
  })

  it('never presents no_flip_found as impossibility', () => {
    const headline = flipTargetHeadline(
      target({ status: 'no_flip_found', k: null, winners: null, changes: null }),
    )
    expect(headline).toBe(
      "No flip found for Carol. This search can't try every possible change, so a flip may still exist.",
    )
    expect(headline).not.toMatch(/impossible|cannot|can't be changed/i)
  })

  it('attributes budget exhaustion to the search, not the election', () => {
    const headline = flipTargetHeadline(
      target({
        status: 'budget_exhausted',
        k: null,
        winners: null,
        changes: null,
      }),
    )
    expect(headline).toBe(
      'The search ran out of budget before finishing Carol.',
    )
    expect(headline).not.toMatch(/no flip|impossible/i)
  })
})

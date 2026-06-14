import { describe, expect, it } from 'vitest'

import { analyzeResults } from '@/lib/analysis'
import type { ElectionResult, ResultData } from '@/lib/results'

// Parity tests for the M16 election-analysis port (ANL-01). The pure
// `analyzeResults` is checked branch-by-branch against the behavior of the Dart
// source (`lib/domain/services/election_analysis_service.dart`): verdict
// detection and each conditional insight. Hand-built result rows keep the
// expected outputs unambiguous.

function makeResult(algorithm: string, result_data: ResultData): ElectionResult {
  return {
    id: algorithm,
    election_id: 'test',
    algorithm,
    result_data,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('analyzeResults — empty / single', () => {
  it('handles no results', () => {
    const a = analyzeResults([])
    expect(a.headline).toBe('No results')
    expect(a.insights).toEqual([])
  })

  it('single algorithm → educational headline, no insights', () => {
    const a = analyzeResults([makeResult('star', { winner: 'Alice' })])
    expect(a.headline).toBe('STAR Voting result')
    expect(a.summary).toContain('STAR voting combines scoring')
    expect(a.insights).toEqual([])
  })
})

describe('analyzeResults — verdict', () => {
  it('allAgree → consensus headline (FPTP included when it matches)', () => {
    const a = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 5 } }),
      makeResult('irv', { winner: 'Alice', rounds: [] }),
      makeResult('star', { winner: 'Alice', scores: { Alice: 9 } }),
    ])
    expect(a.headline).toBe('Consensus: Alice wins across all methods')
    expect(a.summary).toContain('won under every voting method')
  })

  it('mostAgree → "Most methods agree" with the dissenter described', () => {
    const a = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 5 } }),
      makeResult('irv', { winner: 'Alice', rounds: [] }),
      makeResult('star', { winner: 'Bob', scores: { Bob: 9 } }),
    ])
    expect(a.headline).toBe('Most methods agree: Alice')
    expect(a.summary).toContain('Alice won 2 of 3 methods')
    expect(a.summary).toContain('STAR Voting selected Bob')
  })

  it('allDisagree → each method chose a different winner', () => {
    const a = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 5 } }),
      makeResult('irv', { winner: 'Bob', rounds: [] }),
      makeResult('star', { winner: 'Carol', scores: { Carol: 9 } }),
    ])
    expect(a.headline).toBe('Each method chose a different winner')
  })

  it('excludes FPTP from the consensus verdict', () => {
    // Two non-FPTP methods agree on Alice; FPTP picks Bob → still consensus.
    const a = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 5, Bob: 4 } }),
      makeResult('irv', {
        winner: 'Alice',
        rounds: [{ counts: { Bob: 4, Alice: 3 } }],
      }),
      makeResult('fptp', { winner: 'Bob', tallies: { Bob: 4, Alice: 3 } }),
    ])
    expect(a.headline).toBe('Consensus: Alice wins across all methods')
  })
})

describe('analyzeResults — insights', () => {
  it('FPTP divergence: plurality winner differs from all others', () => {
    const a = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 7, Bob: 5 } }),
      makeResult('irv', { winner: 'Alice', rounds: [{ counts: { Alice: 6 } }] }),
      makeResult('fptp', { winner: 'Bob', tallies: { Bob: 5, Alice: 4 } }),
    ])
    const insight = a.insights.find(
      (i) => i.title === 'Plurality chose a different winner',
    )
    expect(insight).toBeDefined()
    expect(insight!.body).toContain('Bob won with 5 first-choice votes')
    expect(insight!.body).toContain('selected Alice instead')
  })

  it('spoiler effect: FPTP winner led IRV round 1 but lost', () => {
    const a = analyzeResults([
      makeResult('irv', {
        winner: 'Alice',
        rounds: [
          { counts: { Bob: 5, Alice: 4, Carol: 2 }, eliminated: ['Carol'] },
          { counts: { Alice: 6, Bob: 5 }, eliminated: null },
        ],
      }),
      makeResult('fptp', { winner: 'Bob', tallies: { Bob: 5, Alice: 4 } }),
    ])
    const insight = a.insights.find((i) => i.title === 'Potential spoiler effect')
    expect(insight).toBeDefined()
    expect(insight!.body).toContain('Bob led in the first round of IRV with 5 votes')
  })

  it('STAR runoff flip: score leader loses the runoff', () => {
    const a = analyzeResults([
      makeResult('star', {
        winner: 'Bob',
        scores: { Alice: 30, Bob: 25 },
        runoff: { Bob: 6, Alice: 4 },
      }),
      makeResult('irv', { winner: 'Bob', rounds: [] }),
    ])
    const insight = a.insights.find(
      (i) => i.title === 'STAR runoff changed the outcome',
    )
    expect(insight).toBeDefined()
    expect(insight!.body).toContain('Alice had the highest total score (30 points)')
    expect(insight!.body).toContain('Bob was preferred by 6 voters vs 4')
  })

  it('approval breadth: approval winner differs from FPTP winner', () => {
    const a = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 8, Bob: 5 } }),
      makeResult('fptp', { winner: 'Bob', tallies: { Bob: 6, Alice: 4 } }),
    ])
    const insight = a.insights.find(
      (i) => i.title === 'Broad support vs. first-choice support',
    )
    expect(insight).toBeDefined()
    expect(insight!.body).toContain('Alice was approved by 8 voters')
    expect(insight!.body).toContain('Bob had the most first-choice votes (6)')
  })

  it('IRV vs approval disagreement fires only when FPTP is absent', () => {
    const withoutFptp = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 8 } }),
      makeResult('irv', {
        winner: 'Bob',
        rounds: [{ counts: { Bob: 5 } }, { counts: { Bob: 6 } }],
      }),
    ])
    expect(
      withoutFptp.insights.some(
        (i) => i.title === 'Ranking and approval methods disagree',
      ),
    ).toBe(true)

    const withFptp = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 8 } }),
      makeResult('irv', {
        winner: 'Bob',
        rounds: [{ counts: { Bob: 5 } }, { counts: { Bob: 6 } }],
      }),
      makeResult('fptp', { winner: 'Carol', tallies: { Carol: 3 } }),
    ])
    expect(
      withFptp.insights.some(
        (i) => i.title === 'Ranking and approval methods disagree',
      ),
    ).toBe(false)
  })
})

describe('analyzeResults — visibility gate', () => {
  it('multi-result consensus with no insights yields empty insights', () => {
    // All agree, no FPTP/STAR/IRV divergence → no insights → card hidden upstream.
    const a = analyzeResults([
      makeResult('approval', { winner: 'Alice', tallies: { Alice: 5 } }),
      makeResult('irv', { winner: 'Alice', rounds: [] }),
    ])
    expect(a.insights).toEqual([])
  })
})

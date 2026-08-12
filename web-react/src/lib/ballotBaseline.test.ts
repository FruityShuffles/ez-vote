import { describe, expect, it } from 'vitest'

import {
  baselineMarks,
  buildBaseline,
  countBaselineMarks,
  type BaselineMarks,
} from '@/lib/ballotBaseline'
import {
  canonicalPayload,
  getTemplate,
  initialBallotState,
  reorderRanking,
  reorderScored,
  setApprovalCutoff,
  setApprovalTopK,
  setFptpChoice,
  setScore,
  toggleApproval,
  type BallotState,
} from '@/lib/ballotState'
import type { Payload } from '@shared/derive'

// The baseline marks (#137): what an edit screen shows about the ballot that was
// actually cast. The two rules under test are that marks are a diff (an untouched
// ballot has none, and putting a value back clears it) and that only directly
// manipulated controls are marked — derived movement is marked at its source.

const IDS = ['a', 'b', 'c']

/** Seed a baseline + current pair the way an edit screen does, from one payload. */
function open(payload: Payload, algos: string[], includeFptp = false) {
  const canonical = canonicalPayload(payload, algos, IDS, includeFptp)
  const template = getTemplate(algos)
  const baseline = buildBaseline(canonical, IDS, algos)
  const marks = (current: BallotState) =>
    baselineMarks(baseline, current, template, IDS, includeFptp)
  return { baseline, current: baseline, marks, template }
}

function marked(marks: BaselineMarks) {
  return countBaselineMarks(marks)
}

describe('marks are a diff, not a decoration', () => {
  it('an untouched ballot carries no marks on any template', () => {
    const cases: [string[], Payload][] = [
      [['irv'], { irv: ['b', 'a', 'c'] }],
      [['star'], { star: { a: 5, b: 2, c: 0 } }],
      [['approval'], { approval: ['a', 'c'] }],
      [['irv', 'approval'], { irv: ['c', 'a', 'b'], approval: ['c', 'a'] }],
      [['star', 'approval'], { star: { a: 5, b: 3, c: 1 }, approval: ['a', 'b'] }],
      [['star', 'irv'], { star: { a: 4, b: 4, c: 1 }, irv: ['b', 'a', 'c'] }],
      [
        ['star', 'irv', 'approval'],
        { star: { a: 4, b: 4, c: 1 }, irv: ['b', 'a', 'c'], approval: ['b'] },
      ],
    ]

    for (const [algos, payload] of cases) {
      const { current, marks } = open(payload, algos)
      expect(marked(marks(current))).toBe(0)
    }
  })

  it('clears the mark when the value is put back (template B)', () => {
    const { current, marks } = open({ star: { a: 5, b: 2, c: 0 } }, ['star'])

    const changed = setScore(current, 'a', 1, IDS)
    expect(marks(changed).scores).toEqual({ a: 5 })

    const restored = setScore(changed, 'a', 5, IDS)
    expect(marked(marks(restored))).toBe(0)
  })
})

describe('directly manipulated controls', () => {
  it('template A marks the original position of every moved candidate', () => {
    const { current, marks } = open({ irv: ['a', 'b', 'c'] }, ['irv'])
    // Drag 'c' to the top: a and b each slide down one.
    const moved = reorderRanking(current, 2, 0)
    expect(marks(moved).positions).toEqual({ c: 3, a: 1, b: 2 })
  })

  it('template C marks the original state of every toggled checkbox', () => {
    const { current, marks } = open({ approval: ['a', 'c'] }, ['approval'])
    let next = toggleApproval(current, 'a') // was approved
    next = toggleApproval(next, 'b') // was not
    expect(marks(next).approvals).toEqual({ a: true, b: false })
  })

  it('template D marks the top-K stepper, not the rows it approves', () => {
    const { current, marks } = open(
      { irv: ['a', 'b', 'c'], approval: ['a'] },
      ['irv', 'approval'],
    )
    const next = setApprovalTopK(current, 3)
    const result = marks(next)
    expect(result.approvalTopK).toBe(1)
    expect(result.positions).toEqual({})
    expect(marked(result)).toBe(1)
  })

  it('template E marks the cutoff stepper, not the rows it approves', () => {
    const { current, marks } = open(
      { star: { a: 5, b: 3, c: 1 }, approval: ['a', 'b'] },
      ['star', 'approval'],
    )
    const next = setApprovalCutoff(current, 5)
    const result = marks(next)
    expect(result.approvalCutoff).toBe(3)
    expect(result.scores).toEqual({})
    expect(marked(result)).toBe(1)
  })
})

describe('derived movement is marked at its source (F/G)', () => {
  it('a score change marks the chip and no positions, however far rows slide', () => {
    const { current, marks } = open(
      { star: { a: 5, b: 3, c: 1 }, irv: ['a', 'b', 'c'] },
      ['star', 'irv'],
    )
    // Drop 'a' to the bottom by scoring it 0 — 'b' and 'c' both move up.
    const next = setScore(current, 'a', 0, IDS)
    const result = marks(next)
    expect(result.scores).toEqual({ a: 5 })
    expect(result.positions).toEqual({})
    expect(marked(result)).toBe(1)
  })

  it('a tie-break drag marks the positions it swapped', () => {
    const { current, marks } = open(
      { star: { a: 4, b: 4, c: 1 }, irv: ['a', 'b', 'c'] },
      ['star', 'irv'],
    )
    // Drag 'b' above 'a' — same score, so only the tie-break order moves.
    const next = reorderScored(current, 'b', 'a', IDS)
    const result = marks(next)
    expect(result.scores).toEqual({})
    expect(result.positions).toEqual({ b: 2, a: 1 })
  })
})

describe('FPTP', () => {
  it('marks an explicit re-pick in template C', () => {
    const { current, marks } = open({ approval: ['a', 'b'], fptp: 'a' }, ['approval'], true)
    const next = setFptpChoice(current, 'b')
    expect(marks(next).fptp).toBe('a')
  })

  it('does not mark a pick that only moved because a score moved (template B)', () => {
    const { current, marks } = open({ star: { a: 5, b: 2, c: 0 }, fptp: 'a' }, ['star'], true)
    // Scoring 'b' above 'a' re-runs autoFptpFromScores, which moves the pick.
    const next = setScore(current, 'b', 5, IDS)
    const result = marks(next)
    expect(result.scores).toEqual({ b: 2 })
    expect(result.fptp).toBeNull()
  })
})

describe('buildBaseline', () => {
  it('recovers approval state the same way the editor was seeded', () => {
    const algos = ['star', 'approval']
    const payload: Payload = { star: { a: 5, b: 3, c: 1 }, approval: ['a', 'b'] }
    const baseline = buildBaseline(
      canonicalPayload(payload, algos, IDS, false),
      IDS,
      algos,
    )
    // Template E recovers the cutoff as the minimum approved score.
    expect(baseline.approvalCutoff).toBe(3)
    expect(baseline).toEqual(initialBallotState(IDS, algos, payload))
  })
})

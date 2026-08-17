import { describe, expect, it } from 'vitest'

import {
  UNNAMED_VOTER,
  approvedBy,
  availableRelations,
  ballotSummary,
  candidateMatchCounts,
  changedCandidates,
  filterBallots,
  matchesRelation,
  summarizeChange,
  topChoiceOf,
  voterName,
  type FilterableBallot,
} from '@/lib/counterfactualFilter'
import { ordinal } from '@/lib/utils'

// Unit tests for the what-if explorer's picker and ledger rules (M21). These are
// the parts that decide what a voter is shown and how an edit is described, so
// they live in a pure module and are tested without React.

const nameOf = (id: string) =>
  ({ ada: 'Ada', bo: 'Bo', cy: 'Cy' })[id] ?? 'Removed candidate'

describe('voterName', () => {
  it('falls back for a missing or blank name', () => {
    expect(voterName({ display_name: 'Priya' })).toBe('Priya')
    expect(voterName({ display_name: null })).toBe(UNNAMED_VOTER)
    expect(voterName({ display_name: '   ' })).toBe(UNNAMED_VOTER)
  })
})

describe('topChoiceOf', () => {
  it('prefers an explicit FPTP pick over everything else', () => {
    expect(
      topChoiceOf({ fptp: 'cy', irv: ['ada', 'bo'], star: { bo: 5 } }),
    ).toBe('cy')
  })

  it('falls back to the head of the IRV ranking', () => {
    expect(topChoiceOf({ irv: ['bo', 'ada'], star: { ada: 5, bo: 1 } })).toBe('bo')
  })

  it('uses the single highest STAR score when there is no ranking', () => {
    expect(topChoiceOf({ star: { ada: 2, bo: 5, cy: 0 } })).toBe('bo')
  })

  it('reports no first preference when the top STAR score is tied', () => {
    // Two candidates tied at 5 is not a first preference; naming one would
    // misreport the voter.
    expect(topChoiceOf({ star: { ada: 5, bo: 5, cy: 1 } })).toBeNull()
  })

  it('reports none for an all-zero or approval-only ballot', () => {
    expect(topChoiceOf({ star: { ada: 0, bo: 0 } })).toBeNull()
    expect(topChoiceOf({ approval: ['ada', 'bo'] })).toBeNull()
    expect(topChoiceOf({})).toBeNull()
  })

  it('ignores an empty IRV array rather than treating it as a choice', () => {
    expect(topChoiceOf({ irv: [], star: { ada: 4 } })).toBe('ada')
  })
})

describe('approvedBy', () => {
  it('returns the approval list, or empty when absent', () => {
    expect(approvedBy({ approval: ['ada', 'cy'] })).toEqual(['ada', 'cy'])
    expect(approvedBy({ star: { ada: 3 } })).toEqual([])
  })
})

describe('availableRelations', () => {
  it('offers both when the ballots express a ranking and approvals', () => {
    expect(
      availableRelations([{ irv: ['ada', 'bo'], approval: ['ada'] }]),
    ).toEqual(['top', 'approved'])
  })

  it('withholds "top" for an approval-only election', () => {
    // Approving is a set, not an order — there is no first preference to filter
    // by, so the picker must not offer one.
    expect(availableRelations([{ approval: ['ada', 'bo'] }])).toEqual(['approved'])
  })

  it('withholds "approved" when no ballot approves anything', () => {
    expect(availableRelations([{ irv: ['ada'] }, { irv: ['bo'] }])).toEqual(['top'])
  })

  it('returns nothing for ballots that express neither', () => {
    expect(availableRelations([{ star: { ada: 0, bo: 0 } }])).toEqual([])
  })
})

describe('matchesRelation', () => {
  it('matches on first preference and on approval separately', () => {
    const payload = { irv: ['bo', 'ada'], approval: ['ada'] }
    expect(matchesRelation(payload, 'top', 'bo')).toBe(true)
    expect(matchesRelation(payload, 'top', 'ada')).toBe(false)
    expect(matchesRelation(payload, 'approved', 'ada')).toBe(true)
    expect(matchesRelation(payload, 'approved', 'bo')).toBe(false)
  })
})

describe('candidateMatchCounts', () => {
  const ballots: FilterableBallot[] = [
    { voter_id: 'v1', display_name: 'Priya', payload: { irv: ['ada', 'bo'], approval: ['ada', 'bo'] } },
    { voter_id: 'v2', display_name: 'Sam', payload: { irv: ['ada', 'cy'], approval: ['ada'] } },
    { voter_id: 'v3', display_name: 'Nia', payload: { irv: ['bo', 'ada'], approval: [] } },
  ]

  it('counts first preferences per candidate', () => {
    const counts = candidateMatchCounts(ballots, 'top')
    expect(counts.get('ada')).toBe(2)
    expect(counts.get('bo')).toBe(1)
  })

  it('counts every approval on a ballot, not just the first', () => {
    const counts = candidateMatchCounts(ballots, 'approved')
    expect(counts.get('ada')).toBe(2)
    expect(counts.get('bo')).toBe(1)
  })

  it('leaves out a candidate no ballot reached', () => {
    expect(candidateMatchCounts(ballots, 'top').has('cy')).toBe(false)
    expect(candidateMatchCounts(ballots, 'approved').has('cy')).toBe(false)
  })

  it('counts a STAR top-tie for nobody, as topChoiceOf reports it', () => {
    const counts = candidateMatchCounts(
      [{ voter_id: 'v1', display_name: null, payload: { star: { ada: 5, bo: 5 } } }],
      'top',
    )
    expect(counts.size).toBe(0)
  })

  it('agrees with what the matching filter would return', () => {
    const counts = candidateMatchCounts(ballots, 'top')
    for (const id of ['ada', 'bo', 'cy']) {
      expect(counts.get(id) ?? 0).toBe(
        filterBallots(ballots, { relation: 'top', candidateId: id }).length,
      )
    }
  })
})

describe('filterBallots', () => {
  const ballots: FilterableBallot[] = [
    { voter_id: 'v1', display_name: 'Priya Menon', payload: { irv: ['ada', 'bo'], approval: ['ada'] } },
    { voter_id: 'v2', display_name: 'Sam Okafor', payload: { irv: ['bo', 'ada'], approval: ['bo', 'ada'] } },
    { voter_id: 'v3', display_name: null, payload: { irv: ['ada', 'bo'], approval: [] } },
  ]

  it('returns everything for an empty filter', () => {
    expect(filterBallots(ballots, {})).toHaveLength(3)
  })

  it('matches names case-insensitively on any substring', () => {
    expect(filterBallots(ballots, { query: 'okaf' }).map((b) => b.voter_id)).toEqual(['v2'])
    expect(filterBallots(ballots, { query: 'PRIYA' }).map((b) => b.voter_id)).toEqual(['v1'])
  })

  it('matches the fallback name for an unnamed voter', () => {
    expect(filterBallots(ballots, { query: 'unnamed' }).map((b) => b.voter_id)).toEqual(['v3'])
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(filterBallots(ballots, { query: '  sam  ' }).map((b) => b.voter_id)).toEqual(['v2'])
  })

  it('filters by candidate relation', () => {
    expect(
      filterBallots(ballots, { relation: 'top', candidateId: 'ada' }).map((b) => b.voter_id),
    ).toEqual(['v1', 'v3'])
    expect(
      filterBallots(ballots, { relation: 'approved', candidateId: 'ada' }).map((b) => b.voter_id),
    ).toEqual(['v1', 'v2'])
  })

  it('applies name and candidate filters together', () => {
    expect(
      filterBallots(ballots, { query: 'a', relation: 'top', candidateId: 'bo' }).map(
        (b) => b.voter_id,
      ),
    ).toEqual(['v2'])
  })

  it('ignores a relation with no candidate selected', () => {
    expect(filterBallots(ballots, { relation: 'top', candidateId: null })).toHaveLength(3)
  })

  it('preserves the input order', () => {
    expect(filterBallots(ballots, { query: 'a' }).map((b) => b.voter_id)).toEqual([
      'v1',
      'v2',
      'v3',
    ])
  })
})

describe('ballotSummary', () => {
  const ids = ['ada', 'bo', 'cy']

  it('uses the ballot\'s own ranking as the order', () => {
    expect(
      ballotSummary({ irv: ['cy', 'ada', 'bo'], star: { ada: 3, bo: 3, cy: 5 } }, ids).map(
        (e) => e.candidateId,
      ),
    ).toEqual(['cy', 'ada', 'bo'])
  })

  it('falls back to score order when there is no ranking', () => {
    expect(
      ballotSummary({ star: { ada: 1, bo: 5, cy: 3 } }, ids).map((e) => e.candidateId),
    ).toEqual(['bo', 'cy', 'ada'])
  })

  it('puts approved candidates first on an approval-only ballot', () => {
    expect(
      ballotSummary({ approval: ['cy'] }, ids).map((e) => e.candidateId),
    ).toEqual(['cy', 'ada', 'bo'])
  })

  it('carries scores and approval flags through', () => {
    expect(
      ballotSummary({ irv: ['ada', 'bo'], star: { ada: 5, bo: 2 }, approval: ['ada'] }, [
        'ada',
        'bo',
      ]),
    ).toEqual([
      { candidateId: 'ada', score: 5, approved: true },
      { candidateId: 'bo', score: 2, approved: false },
    ])
  })

  it('reports no score for ballots that carry none', () => {
    expect(ballotSummary({ irv: ['ada'] }, ['ada'])).toEqual([
      { candidateId: 'ada', score: null, approved: false },
    ])
  })

  it('appends candidates the ballot never mentioned', () => {
    // A candidate added after this ballot was cast still belongs in the strip,
    // otherwise the row misrepresents the election.
    expect(ballotSummary({ irv: ['bo'] }, ids).map((e) => e.candidateId)).toEqual([
      'bo',
      'ada',
      'cy',
    ])
  })

  it('drops candidates the election no longer has', () => {
    expect(
      ballotSummary({ irv: ['gone', 'ada'], approval: ['gone'] }, ['ada']).map(
        (e) => e.candidateId,
      ),
    ).toEqual(['ada'])
  })

  it('never repeats a candidate', () => {
    const entries = ballotSummary(
      { irv: ['ada', 'bo', 'cy'], star: { ada: 1, bo: 2, cy: 3 }, approval: ['ada'] },
      ids,
    )
    expect(new Set(entries.map((e) => e.candidateId)).size).toBe(entries.length)
  })
})

describe('changedCandidates', () => {
  const ids = ['ada', 'bo', 'cy']

  it('finds nothing on an untouched ballot', () => {
    const payload = { irv: ['cy', 'bo', 'ada'], star: { ada: 3, bo: 3, cy: 5 } }
    expect(changedCandidates(payload, { ...payload }, ids).size).toBe(0)
  })

  it('marks both sides of a swap, and nothing that held its place', () => {
    const before = { irv: ['cy', 'bo', 'ada'], star: { ada: 3, bo: 3, cy: 5 } }
    const after = { irv: ['cy', 'ada', 'bo'], star: { ada: 3, bo: 3, cy: 5 } }
    expect(changedCandidates(before, after, ids)).toEqual(new Set(['ada', 'bo']))
  })

  it('marks a candidate whose score moved even when its position did not', () => {
    expect(
      changedCandidates(
        { irv: ['ada', 'bo'], star: { ada: 5, bo: 1 } },
        { irv: ['ada', 'bo'], star: { ada: 4, bo: 1 } },
        ['ada', 'bo'],
      ),
    ).toEqual(new Set(['ada']))
  })

  it('marks a candidate whose approval changed', () => {
    expect(
      changedCandidates(
        { irv: ['ada', 'bo'], approval: ['ada'] },
        { irv: ['ada', 'bo'], approval: ['ada', 'bo'] },
        ['ada', 'bo'],
      ),
    ).toEqual(new Set(['bo']))
  })

  it('marks everything below a candidate promoted to the top', () => {
    // Moving Cy first shifts Ada and Bo down a place each, and all three rows
    // genuinely read differently afterwards.
    expect(
      changedCandidates({ irv: ['ada', 'bo', 'cy'] }, { irv: ['cy', 'ada', 'bo'] }, ids),
    ).toEqual(new Set(['ada', 'bo', 'cy']))
  })
})

describe('ordinal', () => {
  it('handles the regular cases', () => {
    expect([1, 2, 3, 4, 21, 22, 23].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '21st',
      '22nd',
      '23rd',
    ])
  })

  it('handles the teens exception', () => {
    expect([11, 12, 13, 111].map(ordinal)).toEqual(['11th', '12th', '13th', '111th'])
  })
})

describe('summarizeChange', () => {
  it('returns nothing for an identical ballot', () => {
    const payload = { star: { ada: 5, bo: 1 }, irv: ['ada', 'bo'], approval: ['ada'] }
    expect(summarizeChange(payload, { ...payload }, nameOf)).toEqual([])
  })

  it('describes a ranking move with ordinals', () => {
    expect(
      summarizeChange({ irv: ['cy', 'bo', 'ada'] }, { irv: ['cy', 'ada', 'bo'] }, nameOf),
    ).toEqual(['Ada 3rd → 2nd', 'Bo 2nd → 3rd'])
  })

  it('describes a score change with its previous value', () => {
    expect(
      summarizeChange({ star: { ada: 2, bo: 4 } }, { star: { ada: 5, bo: 4 } }, nameOf),
    ).toEqual(['Ada scored 5 (was 2)'])
  })

  it('treats a newly scored candidate as having been 0', () => {
    expect(summarizeChange({ star: {} }, { star: { cy: 3 } }, nameOf)).toEqual([
      'Cy scored 3 (was 0)',
    ])
  })

  it('describes approvals added and removed', () => {
    expect(
      summarizeChange({ approval: ['ada'] }, { approval: ['bo'] }, nameOf),
    ).toEqual(['approved Bo', 'unapproved Ada'])
  })

  it('describes an explicit FPTP pick changing and being cleared', () => {
    expect(summarizeChange({ fptp: 'ada' }, { fptp: 'bo' }, nameOf)).toEqual([
      'picked Bo (was Ada)',
    ])
    expect(summarizeChange({ fptp: 'ada' }, {}, nameOf)).toEqual(['cleared their pick'])
  })

  it('diffs FPTP against the effective pick, not the raw key (#149)', () => {
    // FPTP reads irv[0] when no explicit pick is stored, so writing `fptp` onto
    // a ranked ballot changes the pick FROM the first preference — the chip has
    // to say so, or it reads as a pick appearing out of nowhere.
    expect(
      summarizeChange(
        { irv: ['ada', 'bo'] },
        { irv: ['ada', 'bo'], fptp: 'bo' },
        nameOf,
      ),
    ).toEqual(['picked Bo (was Ada)'])

    // Pinning the honest pick holds FPTP still while another method's key
    // changes, so it is not a change and must not be described as one.
    expect(
      summarizeChange(
        { irv: ['ada', 'bo'] },
        { irv: ['ada', 'bo'], fptp: 'ada' },
        nameOf,
      ),
    ).toEqual([])

    // A plain reordering still says only what the ranking did, even though it
    // moves the derived pick: there is no separate FPTP vote to report.
    expect(
      summarizeChange({ irv: ['ada', 'bo'] }, { irv: ['bo', 'ada'] }, nameOf),
    ).toEqual(['Bo 2nd → 1st', 'Ada 1st → 2nd'])
  })

  it('reports every atomic change so the ledger can count them', () => {
    const phrases = summarizeChange(
      { star: { ada: 1, bo: 4 }, irv: ['bo', 'ada'], approval: ['bo'] },
      { star: { ada: 5, bo: 4 }, irv: ['ada', 'bo'], approval: ['ada'] },
      nameOf,
    )
    expect(phrases).toEqual([
      'Ada 2nd → 1st',
      'Bo 1st → 2nd',
      'Ada scored 5 (was 1)',
      'approved Ada',
      'unapproved Bo',
    ])
  })
})

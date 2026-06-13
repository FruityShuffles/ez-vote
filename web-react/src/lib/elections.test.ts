import { describe, expect, it } from 'vitest'

import { buildCandidateRows } from '@/lib/elections'

describe('CRT-01 - candidate persistence order', () => {
  it('assigns explicit zero-based positions in form order', () => {
    expect(buildCandidateRows('e1', ['Charlie', 'Alice', 'Bob'])).toEqual([
      { election_id: 'e1', name: 'Charlie', position: 0 },
      { election_id: 'e1', name: 'Alice', position: 1 },
      { election_id: 'e1', name: 'Bob', position: 2 },
    ])
  })
})

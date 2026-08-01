import { beforeEach, describe, expect, it } from 'vitest'

import {
  ELECTION_DRAFT_MAX_AGE_MS,
  clearElectionDraft,
  electionDraftKey,
  readElectionDraft,
  writeElectionDraft,
  type ElectionDraftForm,
} from '@/lib/electionDrafts'

const form: ElectionDraftForm = {
  title: 'Neighborhood board',
  description: null,
  algorithms: ['approval'],
  allow_voter_candidates: false,
  realtime_results: false,
  include_fptp: true,
  public_ballots: false,
  candidates: [
    { id: 'c1', name: 'Ada' },
    { id: 'c2', name: 'Grace' },
  ],
}

beforeEach(() => window.localStorage.clear())

describe('election draft persistence', () => {
  it('uses separate create and edit keys', () => {
    expect(electionDraftKey()).toBe('draft:create')
    expect(electionDraftKey('e1')).toBe('draft:edit:e1')
  })

  it('expires and removes a week-old draft', () => {
    const key = electionDraftKey()
    writeElectionDraft(key, form, null, 1_000)

    expect(readElectionDraft(key, 1_000 + ELECTION_DRAFT_MAX_AGE_MS)).toBeNull()
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('clears a stored draft explicitly', () => {
    const key = electionDraftKey('e1')
    writeElectionDraft(key, form, '2026-01-01T00:00:00Z')
    clearElectionDraft(key)

    expect(readElectionDraft(key)).toBeNull()
  })
})

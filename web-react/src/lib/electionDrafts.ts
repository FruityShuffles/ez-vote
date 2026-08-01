import type { ElectionFormInput, VotingAlgorithm } from '@/lib/elections'

export type CandidateDraft = { id: string; name: string }
export type ElectionDraftForm = Omit<
  ElectionFormInput,
  'candidates' | 'open'
> & {
  candidates: CandidateDraft[]
}

export interface StoredElectionDraft {
  form: ElectionDraftForm
  savedAt: number
  sourceUpdatedAt: string | null
}

export const ELECTION_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000

export function electionDraftKey(electionId?: string) {
  return electionId ? `draft:edit:${electionId}` : 'draft:create'
}

export function readElectionDraft(
  key: string,
  now = Date.now(),
): StoredElectionDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return null
    const draft: unknown = JSON.parse(raw)
    if (!isStoredElectionDraft(draft) || now - draft.savedAt >= ELECTION_DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function writeElectionDraft(
  key: string,
  form: ElectionDraftForm,
  sourceUpdatedAt: string | null,
  now = Date.now(),
) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ form, savedAt: now, sourceUpdatedAt }),
    )
  } catch {
    // Persistence is best-effort when browser storage is unavailable.
  }
}

export function clearElectionDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to clear when browser storage is unavailable.
  }
}

function isStoredElectionDraft(value: unknown): value is StoredElectionDraft {
  if (!isRecord(value) || !isRecord(value.form)) return false
  const form = value.form
  return (
    typeof value.savedAt === 'number' &&
    Number.isFinite(value.savedAt) &&
    (value.sourceUpdatedAt == null ||
      typeof value.sourceUpdatedAt === 'string') &&
    typeof form.title === 'string' &&
    (form.description == null || typeof form.description === 'string') &&
    Array.isArray(form.algorithms) &&
    form.algorithms.every(isAlgorithm) &&
    typeof form.allow_voter_candidates === 'boolean' &&
    typeof form.realtime_results === 'boolean' &&
    typeof form.include_fptp === 'boolean' &&
    typeof form.public_ballots === 'boolean' &&
    Array.isArray(form.candidates) &&
    form.candidates.every(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string',
    )
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null
}

function isAlgorithm(value: unknown): value is VotingAlgorithm {
  return value === 'approval' || value === 'irv' || value === 'star'
}

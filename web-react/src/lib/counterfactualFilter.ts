import type { Payload } from '@shared/derive'

// Pure helpers for the what-if explorer's ballot picker and edit ledger (M21).
// No React, no network — the search/filter rules and the "what changed" phrasing
// are the parts worth testing directly, so they live here rather than inside
// components (same split as `@/lib/ballotState` under the ballot UI).

/** The minimum a ballot needs to be searchable; matches `PublicBallot`. */
export interface FilterableBallot {
  voter_id: string
  display_name: string | null
  payload: Payload
}

/** Shown wherever a ballot has no name attached (deleted account, blank name). */
export const UNNAMED_VOTER = 'Unnamed voter'

export function voterName(ballot: {
  display_name: string | null
}): string {
  return ballot.display_name?.trim() || UNNAMED_VOTER
}

// ── Ballot relations ─────────────────────────────────────────────────────────
//
// The issue asks to filter by "ballots that chose candidate A". Which relations
// a ballot can actually answer depends on its template, so rather than force one
// question onto every election we offer only the ones the payloads support:
//
//   top      — this candidate is the voter's first preference
//   approved — the voter approved this candidate
//
// An approval-only election (template C, no FPTP) genuinely has no first
// preference — approving is a set, not an order — so `top` is withheld there
// instead of inventing an answer.

export type BallotRelation = 'top' | 'approved'

export const RELATION_LABELS: Record<BallotRelation, string> = {
  top: 'Top choice',
  approved: 'Approved',
}

/**
 * The voter's first preference, or null when the ballot doesn't express one.
 *
 * Resolution order mirrors how the tabulator reads a ballot: an explicit FPTP
 * choice wins, then the head of the IRV ranking, then the single highest STAR
 * score. A STAR tie for top is deliberately null — two candidates tied at 5 is
 * not a first preference, and picking one would misreport the voter.
 */
export function topChoiceOf(payload: Payload): string | null {
  if (payload.fptp != null) return payload.fptp
  if (payload.irv != null && payload.irv.length > 0) return payload.irv[0]

  const scores = payload.star
  if (scores != null) {
    let best: string | null = null
    let bestScore = 0
    let tied = false
    for (const [id, score] of Object.entries(scores)) {
      if (score > bestScore) {
        best = id
        bestScore = score
        tied = false
      } else if (score === bestScore && bestScore > 0) {
        tied = true
      }
    }
    return tied ? null : best
  }
  return null
}

/** Candidates this ballot approved (empty when the ballot carries no approvals). */
export function approvedBy(payload: Payload): string[] {
  return payload.approval ?? []
}

/** Which relations the ballots in this election can actually be filtered by. */
export function availableRelations(payloads: Payload[]): BallotRelation[] {
  const relations: BallotRelation[] = []
  if (payloads.some((p) => topChoiceOf(p) != null)) relations.push('top')
  if (payloads.some((p) => approvedBy(p).length > 0)) relations.push('approved')
  return relations
}

export function matchesRelation(
  payload: Payload,
  relation: BallotRelation,
  candidateId: string,
): boolean {
  return relation === 'top'
    ? topChoiceOf(payload) === candidateId
    : approvedBy(payload).includes(candidateId)
}

export interface BallotFilter {
  /** Free-text match against the voter's display name. */
  query?: string
  relation?: BallotRelation
  candidateId?: string | null
}

/** Name search and candidate filter, applied together (AND). Order preserved. */
export function filterBallots<T extends FilterableBallot>(
  ballots: T[],
  filter: BallotFilter,
): T[] {
  const query = filter.query?.trim().toLowerCase() ?? ''
  const { relation, candidateId } = filter

  return ballots.filter((ballot) => {
    if (query !== '' && !voterName(ballot).toLowerCase().includes(query)) {
      return false
    }
    if (relation != null && candidateId != null) {
      return matchesRelation(ballot.payload, relation, candidateId)
    }
    return true
  })
}

// ── Ballot fingerprints ──────────────────────────────────────────────────────

/** One candidate's standing on a ballot, in that ballot's own reading order. */
export interface BallotEntry {
  candidateId: string
  /** STAR score, or null on ballots that don't carry scores. */
  score: number | null
  approved: boolean
}

/**
 * Flatten a stored payload into an ordered, renderable summary — the whole
 * ballot at a glance, rather than just its first preference.
 *
 * Order is whatever that ballot itself expresses: an explicit ranking if it has
 * one, else score order, else approvals first. Candidates the election no longer
 * has are dropped; candidates the ballot never mentioned are appended so the
 * list is always complete.
 */
export function ballotSummary(
  payload: Payload,
  candidateIds: string[],
): BallotEntry[] {
  const known = new Set(candidateIds)
  const approved = new Set(approvedBy(payload).filter((id) => known.has(id)))
  const scores = payload.star

  let order: string[]
  if (payload.irv != null && payload.irv.length > 0) {
    order = payload.irv.filter((id) => known.has(id))
  } else if (scores != null) {
    order = candidateIds
      .filter((id) => id in scores)
      .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
  } else {
    order = candidateIds.filter((id) => approved.has(id))
  }

  for (const id of candidateIds) {
    if (!order.includes(id)) order.push(id)
  }

  return order.map((candidateId) => ({
    candidateId,
    score: scores?.[candidateId] ?? null,
    approved: approved.has(candidateId),
  }))
}

// ── Change summaries (the edit ledger) ───────────────────────────────────────

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'] as const

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const rem100 = n % 100
  const rem10 = n % 10
  const suffix =
    rem100 >= 11 && rem100 <= 13
      ? 'th'
      : (ORDINAL_SUFFIXES[rem10] ?? 'th')
  return `${n}${suffix}`
}

/**
 * Short phrases describing how a hypothetical ballot differs from the real one,
 * for the edit ledger. Returns one phrase per atomic change so the caller can
 * show the first and count the rest; empty means the ballot is unchanged.
 *
 * Field order follows what the voter manipulated most directly: ranking moves,
 * then scores, then approvals, then an explicit FPTP pick.
 */
export function summarizeChange(
  original: Payload,
  next: Payload,
  nameOf: (candidateId: string) => string,
): string[] {
  const phrases: string[] = []

  const before = original.irv ?? []
  const after = next.irv ?? []
  if (before.length > 0 || after.length > 0) {
    for (const [index, id] of after.entries()) {
      const wasAt = before.indexOf(id)
      if (wasAt >= 0 && wasAt !== index) {
        phrases.push(
          `${nameOf(id)} ${ordinal(wasAt + 1)} → ${ordinal(index + 1)}`,
        )
      }
    }
  }

  const beforeScores = original.star ?? {}
  const afterScores = next.star ?? {}
  for (const id of Object.keys(afterScores)) {
    const from = beforeScores[id] ?? 0
    const to = afterScores[id] ?? 0
    if (from !== to) {
      phrases.push(`${nameOf(id)} scored ${to} (was ${from})`)
    }
  }

  const beforeApproved = new Set(approvedBy(original))
  const afterApproved = new Set(approvedBy(next))
  for (const id of afterApproved) {
    if (!beforeApproved.has(id)) phrases.push(`approved ${nameOf(id)}`)
  }
  for (const id of beforeApproved) {
    if (!afterApproved.has(id)) phrases.push(`unapproved ${nameOf(id)}`)
  }

  if (original.fptp !== next.fptp) {
    phrases.push(
      next.fptp == null
        ? 'cleared their pick'
        : `picked ${nameOf(next.fptp)}`,
    )
  }

  return phrases
}

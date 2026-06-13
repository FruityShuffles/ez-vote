import {
  applyReorder,
  autoFptpFromScores,
  buildPayload,
  deriveApprovalsFromScores,
  deriveRanking,
  rebuildTieBreaksFromOrder,
  syncTieBreaks,
  type Payload,
  type Scores,
  type TieBreaks,
} from '@shared/derive'

// Pure ballot state + transitions for the voting flow (M10), ported from the
// stateful logic in Flutter's `lib/presentation/screens/ballot_screen.dart`.
// Every derivation (ranking, approvals, tie-break sync, drag auto-scoring, FPTP
// auto-select) is delegated to the M23 `@shared/derive` module — this file only
// orchestrates which transition runs for which template and threads immutable
// state. Keeping it pure (no React) lets the parity-critical behaviour be unit
// tested directly against the golden fixtures (BAL-02…BAL-10).

/** The complete in-progress ballot, mirroring the Dart `_BallotScreenState` fields. */
export interface BallotState {
  /** STAR scores (0–5) by candidate id — the source of truth when STAR is present. */
  scores: Scores
  /** Direct preference order, IRV-only templates (A/D). */
  rankings: string[]
  /** Approved candidate ids, Approval-only template (C). */
  approvals: string[]
  /** FPTP first choice (templates B/C/E when `include_fptp`), else null. */
  fptpChoice: string | null
  /** STAR+Approval (E): approve candidates scoring ≥ this. */
  approvalCutoff: number
  /** IRV+Approval (D) / STAR+IRV+Approval (G): approve this many top-ranked. */
  approvalTopK: number
  /** score → ordered tied ids (score > 0), the manual tie-break order (F/G). */
  tieBreaks: TieBreaks
}

const DEFAULT_APPROVAL_CUTOFF = 3
const DEFAULT_APPROVAL_TOP_K = 0

/** Map an algorithm combination to its ballot template (A–G). FPTP is additive. */
export function getTemplate(algos: string[]): string {
  const hasA = algos.includes('approval')
  const hasI = algos.includes('irv')
  const hasS = algos.includes('star')

  if (hasS && hasI && hasA) return 'G'
  if (hasS && hasI) return 'F'
  if (hasS && hasA) return 'E'
  if (hasI && hasA) return 'D'
  if (hasA) return 'C'
  if (hasI) return 'A'
  return 'B' // STAR only (default)
}

function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Candidates at the nonzero maximum score (empty when the top score is 0). */
export function topScoredIds(scores: Scores, candidateIds: string[]): string[] {
  let maxScore = 0
  for (const id of candidateIds) {
    const s = scores[id] ?? 0
    if (s > maxScore) maxScore = s
  }
  if (maxScore === 0) return []
  return candidateIds.filter((id) => (scores[id] ?? 0) === maxScore)
}

/**
 * Build the starting state for a ballot. For an edit (or public-ballot view) the
 * saved `payload` is rehydrated into every field — scores, ranking, approval AND
 * fptp — so reopening a ballot restores all prior inputs (BAL-08, the #39
 * regression). New candidates added since the ballot was saved are folded in
 * (score 0 / appended), deleted ones dropped (BAL-09).
 */
export function initialBallotState(
  candidateIds: string[],
  algos: string[],
  payload?: Payload | null,
): BallotState {
  const hasStar = algos.includes('star')
  const hasIrv = algos.includes('irv')

  const state: BallotState = {
    scores: hasStar ? Object.fromEntries(candidateIds.map((id) => [id, 0])) : {},
    rankings: hasIrv && !hasStar ? [...candidateIds] : [],
    approvals: [],
    fptpChoice: null,
    approvalCutoff: DEFAULT_APPROVAL_CUTOFF,
    approvalTopK: DEFAULT_APPROVAL_TOP_K,
    tieBreaks: {},
  }

  if (!payload) return state

  const currentIds = new Set(candidateIds)

  if (payload.star != null) {
    const scores: Scores = {}
    for (const [id, v] of Object.entries(payload.star)) scores[id] = Math.trunc(v)
    for (const id of candidateIds) if (!(id in scores)) scores[id] = 0
    for (const id of Object.keys(scores)) if (!currentIds.has(id)) delete scores[id]
    state.scores = scores
  }

  if (payload.irv != null && !hasStar) {
    const rankings = payload.irv.filter((id) => currentIds.has(id))
    for (const id of candidateIds) if (!rankings.includes(id)) rankings.push(id)
    state.rankings = rankings
  }

  if (payload.approval != null) {
    const saved = payload.approval.filter((id) => currentIds.has(id))
    if (!hasStar && !hasIrv) {
      // Template C: restore approvals directly.
      state.approvals = saved
    } else if (hasStar && !hasIrv) {
      // Template E: recover the cutoff as the min score among approved.
      if (saved.length > 0) {
        state.approvalCutoff = Math.min(...saved.map((id) => state.scores[id] ?? 0))
      }
    } else {
      // Templates D / G: recover top-K from how many were approved.
      state.approvalTopK = saved.length
    }
  }

  if (payload.fptp != null && currentIds.has(payload.fptp)) {
    state.fptpChoice = payload.fptp
  }

  if (hasStar) {
    if (payload.irv != null) {
      // Restore the manual tie-break order from the saved ranking so view-only
      // mode shows exactly what was submitted, and an untouched re-submit can't
      // silently flip a tie. (The Flutter reference rebuilt tie-breaks from
      // candidate order here, losing the voter's saved order — fixed in React.)
      // Candidates missing from the saved ranking are appended in candidate order.
      const order = payload.irv.filter((id) => currentIds.has(id))
      for (const id of candidateIds) if (!order.includes(id)) order.push(id)
      state.tieBreaks = rebuildTieBreaksFromOrder(order, state.scores)
    } else {
      state.tieBreaks = syncTieBreaks(state.tieBreaks, state.scores, candidateIds)
    }
  }

  return state
}

/**
 * Set a STAR score (templates B/E/F/G). Re-syncs tie-break groups so manual
 * orderings survive the change (BAL-03) and re-runs FPTP auto-selection so a
 * single top scorer is auto-picked / a stale pick cleared (BAL-07).
 */
export function setScore(
  state: BallotState,
  candidateId: string,
  score: number,
  candidateIds: string[],
): BallotState {
  const scores = { ...state.scores, [candidateId]: score }
  return {
    ...state,
    scores,
    tieBreaks: syncTieBreaks(state.tieBreaks, scores, candidateIds),
    fptpChoice: autoFptpFromScores(scores, candidateIds, state.fptpChoice),
  }
}

/** Reorder the direct ranking (templates A/D); `from`/`to` are list indices. */
export function reorderRanking(
  state: BallotState,
  from: number,
  to: number,
): BallotState {
  if (from === to) return state
  return { ...state, rankings: arrayMove(state.rankings, from, to) }
}

/**
 * Drag-reorder a score-sorted list (templates F/G). `activeId`/`overId` are the
 * dnd-kit drag endpoints within the currently-derived display order. Delegates
 * to `applyReorder` for the #83 rank-first/score-later auto-bump and #78 0-score
 * handling (BAL-04/05). dnd-kit reports the final target index, so it is mapped
 * back to the Flutter `ReorderableListView` raw index `applyReorder` expects.
 */
export function reorderScored(
  state: BallotState,
  activeId: string,
  overId: string,
  candidateIds: string[],
): BallotState {
  const order = deriveRanking(state.scores, state.tieBreaks, candidateIds)
  const oldIndex = order.indexOf(activeId)
  const overIndex = order.indexOf(overId)
  if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) return state

  // dnd-kit final index → Flutter raw index (which applyReorder decrements when
  // moving downward).
  const rawNewIndex = overIndex > oldIndex ? overIndex + 1 : overIndex
  const { scores, tieBreaks } = applyReorder(
    state.scores,
    order,
    oldIndex,
    rawNewIndex,
  )
  return { ...state, scores, tieBreaks }
}

/** Toggle approval for a candidate (template C). Unchecking clears a matching FPTP pick. */
export function toggleApproval(
  state: BallotState,
  candidateId: string,
): BallotState {
  const approved = state.approvals.includes(candidateId)
  if (approved) {
    return {
      ...state,
      approvals: state.approvals.filter((id) => id !== candidateId),
      fptpChoice: state.fptpChoice === candidateId ? null : state.fptpChoice,
    }
  }
  return { ...state, approvals: [...state.approvals, candidateId] }
}

export function setFptpChoice(
  state: BallotState,
  candidateId: string | null,
): BallotState {
  return { ...state, fptpChoice: candidateId }
}

export function setApprovalCutoff(state: BallotState, cutoff: number): BallotState {
  return { ...state, approvalCutoff: cutoff }
}

export function setApprovalTopK(state: BallotState, topK: number): BallotState {
  return { ...state, approvalTopK: topK }
}

/**
 * Fold a refreshed candidate list into in-progress state without discarding the
 * voter's work (BAL-10): new candidates get a 0 score / are appended to the
 * ranking (never auto-approved), removed candidates are stripped from every
 * map, and a vanished FPTP pick is cleared.
 */
export function mergeCandidates(
  state: BallotState,
  freshCandidateIds: string[],
  algos: string[],
): BallotState {
  const idSet = new Set(freshCandidateIds)
  const hasStar = algos.includes('star')
  const hasIrv = algos.includes('irv')
  const hasApproval = algos.includes('approval')

  let { scores, rankings, approvals, tieBreaks } = state
  let fptpChoice = state.fptpChoice

  if (hasStar) {
    scores = { ...scores }
    for (const id of freshCandidateIds) if (!(id in scores)) scores[id] = 0
    for (const id of Object.keys(scores)) if (!idSet.has(id)) delete scores[id]
    tieBreaks = syncTieBreaks(tieBreaks, scores, freshCandidateIds)
  }

  if (hasIrv && !hasStar) {
    rankings = rankings.filter((id) => idSet.has(id))
    for (const id of freshCandidateIds) if (!rankings.includes(id)) rankings.push(id)
  }

  if (hasApproval && !hasStar && !hasIrv) {
    approvals = approvals.filter((id) => idSet.has(id))
  }

  if (fptpChoice != null && !idSet.has(fptpChoice)) fptpChoice = null

  return { ...state, scores, rankings, approvals, fptpChoice, tieBreaks }
}

/** The derived ranking shown for score-sorted templates (F/G). */
export function displayRanking(
  state: BallotState,
  candidateIds: string[],
): string[] {
  return deriveRanking(state.scores, state.tieBreaks, candidateIds)
}

/** Whether the ballot currently approves nobody — drives the soft warning (BAL-12). */
export function hasZeroApprovals(
  state: BallotState,
  template: string,
  candidateIds: string[],
): boolean {
  switch (template) {
    case 'C':
      return state.approvals.length === 0
    case 'D':
    case 'G':
      return state.approvalTopK === 0
    case 'E':
      return (
        deriveApprovalsFromScores(state.scores, candidateIds, state.approvalCutoff)
          .length === 0
      )
    default:
      return false
  }
}

/** Hard validation messages that block submission (mirrors `_getBlockingErrors`). */
export function getBlockingErrors(
  state: BallotState,
  template: string,
  candidateIds: string[],
  includeFptp: boolean,
): string[] {
  const errors: string[] = []
  if (['B', 'E', 'F', 'G'].includes(template)) {
    if (candidateIds.every((id) => (state.scores[id] ?? 0) === 0)) {
      errors.push('Rate at least one candidate above 0')
    }
  }
  if (
    includeFptp &&
    ['B', 'C', 'E'].includes(template) &&
    state.fptpChoice == null
  ) {
    errors.push('Pick a first choice for the FPTP comparison')
  }
  return errors
}

/** Assemble the submit payload via the shared derivation (BAL-02). */
export function buildSubmitPayload(
  state: BallotState,
  template: string,
  candidateIds: string[],
  includeFptp: boolean,
): Payload {
  // FPTP is only carried by templates B/C/E — the picker is shown and validated
  // only there. IRV templates (A/D/F/G) derive first choice from the ranking, so
  // a score-driven `fptpChoice` must never leak into their payloads (BAL-06).
  const emitFptp = includeFptp && ['B', 'C', 'E'].includes(template)
  return buildPayload(
    template,
    {
      scores: state.scores,
      rankings: state.rankings,
      approvals: state.approvals,
      tieBreaks: state.tieBreaks,
      approvalCutoff: state.approvalCutoff,
      approvalTopK: state.approvalTopK,
      fptpChoice: state.fptpChoice,
    },
    candidateIds,
    emitFptp,
  )
}

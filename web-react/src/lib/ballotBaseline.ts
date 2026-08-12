import { displayRanking, initialBallotState, type BallotState } from '@/lib/ballotState'
import type { Payload } from '@shared/derive'

// The baseline ballot (#137) — what the voter actually cast, kept alongside what
// they are editing so the screen can show where each answer used to be.
//
// Two screens change a ballot that already exists: `routes/Ballot.tsx` (your own
// submitted ballot, in an open election) and the what-if editor
// (`routes/CounterfactualExplorer.tsx`, someone else's ballot, hypothetically).
// They are the same operation — the only differences are whose ballot it is and
// whether saving is real — so there is one baseline object and one set of marks,
// drawn once inside `BallotView`.
//
// Two rules keep the marking honest across all seven templates:
//
//   1. The mark is a DIFF, not a decoration. A freshly-opened ballot carries no
//      marks at all; a mark appears when a control's value leaves what was cast
//      and disappears the moment it is put back.
//   2. Mark only what the voter manipulates DIRECTLY. Derived values are marked
//      at their source control, never on every row they touch — in F/G one score
//      change reshuffles the whole list, and badging every displaced row would
//      bury the one thing that actually moved.
//
// Pure and React-free, same split as `ballotState.ts` under the ballot UI: the
// rules below are the part worth testing directly.

const SCORE_TEMPLATES = ['B', 'E', 'F', 'G']
const DIRECT_RANK_TEMPLATES = ['A', 'D']
const DERIVED_RANK_TEMPLATES = ['F', 'G']
const TOP_K_TEMPLATES = ['D', 'G']
const FPTP_TEMPLATES = ['B', 'C', 'E']

/** Every control whose value differs from the cast ballot, and what it held. */
export interface BaselineMarks {
  /** candidate id → original STAR score (templates B/E/F/G). */
  scores: Record<string, number>
  /** candidate id → original 1-based list position (A/D always, F/G tie-breaks). */
  positions: Record<string, number>
  /** candidate id → whether it was originally approved (template C). */
  approvals: Record<string, boolean>
  /** Original FPTP pick, or null when the pick is unchanged / not marked. */
  fptp: string | null
  /** Original "approve top N" (D/G), null when unchanged. */
  approvalTopK: number | null
  /** Original "approve score ≥ N" (E), null when unchanged. */
  approvalCutoff: number | null
}

export const NO_BASELINE_MARKS: BaselineMarks = {
  scores: {},
  positions: {},
  approvals: {},
  fptp: null,
  approvalTopK: null,
  approvalCutoff: null,
}

/**
 * Rehydrate the cast ballot into the same shape the editor holds.
 *
 * This is deliberately `initialBallotState` — the very function the editor was
 * seeded with — so the baseline recovers template E's cutoff and D/G's top-K by
 * exactly the same rules, and an untouched ballot compares equal field by field.
 * Pass a payload that has already been through `canonicalPayload`.
 */
export function buildBaseline(
  payload: Payload,
  candidateIds: string[],
  algos: string[],
): BallotState {
  return initialBallotState(candidateIds, algos, payload)
}

export function countBaselineMarks(marks: BaselineMarks): number {
  return (
    Object.keys(marks.scores).length +
    Object.keys(marks.positions).length +
    Object.keys(marks.approvals).length +
    (marks.fptp != null ? 1 : 0) +
    (marks.approvalTopK != null ? 1 : 0) +
    (marks.approvalCutoff != null ? 1 : 0)
  )
}

export function hasBaselineMarks(marks: BaselineMarks): boolean {
  return countBaselineMarks(marks) > 0
}

/**
 * Which controls to mark, given the cast ballot and the one on screen.
 *
 * Returns `NO_BASELINE_MARKS` when nothing differs, so an unedited ballot renders
 * exactly as it does today.
 */
export function baselineMarks(
  baseline: BallotState,
  current: BallotState,
  template: string,
  candidateIds: string[],
  includeFptp: boolean,
): BaselineMarks {
  const scores = SCORE_TEMPLATES.includes(template)
    ? changedScores(baseline, current, candidateIds)
    : {}
  const scoresMoved = Object.keys(scores).length > 0

  let positions: Record<string, number> = {}
  if (DIRECT_RANK_TEMPLATES.includes(template)) {
    positions = changedDirectPositions(baseline, current)
  } else if (DERIVED_RANK_TEMPLATES.includes(template)) {
    positions = changedTieBreakPositions(baseline, current, candidateIds, scores)
  }

  const approvals =
    template === 'C' ? changedApprovals(baseline, current, candidateIds) : {}

  // FPTP is a direct choice in template C, but in B/E it is re-derived from the
  // scores on every change (`autoFptpFromScores`). A pick that moved because a
  // score moved is a consequence, so it is marked at the score chip instead.
  const fptpIsDirect = template === 'C' || !scoresMoved
  const fptp =
    includeFptp &&
    FPTP_TEMPLATES.includes(template) &&
    fptpIsDirect &&
    baseline.fptpChoice !== current.fptpChoice
      ? baseline.fptpChoice
      : null

  const approvalTopK =
    TOP_K_TEMPLATES.includes(template) &&
    baseline.approvalTopK !== current.approvalTopK
      ? baseline.approvalTopK
      : null

  const approvalCutoff =
    template === 'E' && baseline.approvalCutoff !== current.approvalCutoff
      ? baseline.approvalCutoff
      : null

  return { scores, positions, approvals, fptp, approvalTopK, approvalCutoff }
}

// ── Per-control rules ────────────────────────────────────────────────────────

function changedScores(
  baseline: BallotState,
  current: BallotState,
  candidateIds: string[],
): Record<string, number> {
  const marks: Record<string, number> = {}
  for (const id of candidateIds) {
    const was = baseline.scores[id] ?? 0
    if (was !== (current.scores[id] ?? 0)) marks[id] = was
  }
  return marks
}

/** Templates A/D: the ranking IS the voter's input, so every move is direct. */
function changedDirectPositions(
  baseline: BallotState,
  current: BallotState,
): Record<string, number> {
  const marks: Record<string, number> = {}
  current.rankings.forEach((id, index) => {
    const was = baseline.rankings.indexOf(id)
    if (was >= 0 && was !== index) marks[id] = was + 1
  })
  return marks
}

/**
 * Templates F/G: the list order falls out of the scores, so most movement is a
 * consequence rather than an edit. The exception is a drag *within* a tie group,
 * which reorders candidates the scores alone cannot separate — that is the one
 * ranking gesture the voter makes directly here, and the only one marked.
 *
 * Isolating it: group by the candidate's original score, drop anyone whose score
 * changed (they left the comparison), and compare relative order inside what
 * remains. A score edit shifts whole groups past each other without disturbing
 * the order within any of them, so it produces no marks; a tie-break drag shows
 * up as exactly the candidates it swapped.
 *
 * The accepted limit: a drag within a tie the voter *created* by editing a score
 * goes unmarked, because the candidates involved were never tied on the ballot
 * as cast and so have no shared position to point back to. The score change that
 * created the tie is marked, and marking nothing is the right failure direction
 * — a wrong ghost position is worse than a missing one.
 */
function changedTieBreakPositions(
  baseline: BallotState,
  current: BallotState,
  candidateIds: string[],
  changedScoreIds: Record<string, number>,
): Record<string, number> {
  const baselineOrder = displayRanking(baseline, candidateIds)
  const currentOrder = displayRanking(current, candidateIds)

  const stable = (id: string) => !(id in changedScoreIds)
  const groupOf = (id: string) => baseline.scores[id] ?? 0

  const rankIn = (order: string[]) => {
    const seats = new Map<string, number>()
    const seen = new Map<number, number>()
    for (const id of order) {
      if (!stable(id)) continue
      const group = groupOf(id)
      const next = seen.get(group) ?? 0
      seats.set(id, next)
      seen.set(group, next + 1)
    }
    return seats
  }

  const before = rankIn(baselineOrder)
  const after = rankIn(currentOrder)

  const marks: Record<string, number> = {}
  for (const [id, seat] of after) {
    if (before.get(id) !== seat) marks[id] = baselineOrder.indexOf(id) + 1
  }
  return marks
}

/** Template C: the checkbox is the input, so every toggle is direct. */
function changedApprovals(
  baseline: BallotState,
  current: BallotState,
  candidateIds: string[],
): Record<string, boolean> {
  const was = new Set(baseline.approvals)
  const now = new Set(current.approvals)
  const marks: Record<string, boolean> = {}
  for (const id of candidateIds) {
    if (was.has(id) !== now.has(id)) marks[id] = was.has(id)
  }
  return marks
}

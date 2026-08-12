import { useCallback, useMemo, useState } from 'react'

import type { Candidate } from '@/lib/elections'
import type { Payload } from '@shared/derive'
import {
  buildSubmitPayload,
  displayRanking,
  getBlockingErrors,
  getTemplate,
  hasZeroApprovals,
  initialBallotState,
  mergeCandidates,
  reorderRanking,
  reorderScored,
  setApprovalCutoff,
  setApprovalTopK,
  setFptpChoice,
  setScore,
  toggleApproval,
  type BallotState,
} from '@/lib/ballotState'

// React binding over the pure `ballotState` transitions. Holds the working
// ballot in component state and exposes named handlers the template UIs call;
// all logic stays in the pure module so it's testable without React (M10).

interface UseBallotStateOptions {
  candidates: Candidate[]
  algorithms: string[]
  includeFptp: boolean
  /** Saved payload when editing / viewing an existing ballot, else null. */
  existingPayload: Payload | null
}

export function useBallotState({
  candidates,
  algorithms,
  includeFptp,
  existingPayload,
}: UseBallotStateOptions) {
  const template = useMemo(() => getTemplate(algorithms), [algorithms])
  const candidateIds = useMemo(() => candidates.map((c) => c.id), [candidates])

  const [state, setState] = useState<BallotState>(() =>
    initialBallotState(
      candidates.map((c) => c.id),
      algorithms,
      existingPayload,
    ),
  )

  const handleScore = useCallback(
    (id: string, score: number) =>
      setState((s) => setScore(s, id, score, candidateIds)),
    [candidateIds],
  )
  const handleReorderRanking = useCallback(
    (from: number, to: number) => setState((s) => reorderRanking(s, from, to)),
    [],
  )
  const handleReorderScored = useCallback(
    (activeId: string, overId: string) =>
      setState((s) => reorderScored(s, activeId, overId, candidateIds)),
    [candidateIds],
  )
  const handleToggleApproval = useCallback(
    (id: string) => setState((s) => toggleApproval(s, id)),
    [],
  )
  const handleFptpChoice = useCallback(
    (id: string | null) => setState((s) => setFptpChoice(s, id)),
    [],
  )
  const handleApprovalCutoff = useCallback(
    (n: number) => setState((s) => setApprovalCutoff(s, n)),
    [],
  )
  const handleApprovalTopK = useCallback(
    (n: number) => setState((s) => setApprovalTopK(s, n)),
    [],
  )
  const handleMerge = useCallback(
    (freshCandidateIds: string[]) =>
      setState((s) => mergeCandidates(s, freshCandidateIds, algorithms)),
    [algorithms],
  )
  // Throw away the working ballot and re-seed from a payload — the undo behind
  // the change banner (#137). Deliberately a full re-seed rather than a stack of
  // inverse transitions: `initialBallotState` is the one place that knows how to
  // recover a template's approval state, so this cannot drift from how the
  // ballot was opened in the first place.
  const handleReset = useCallback(
    (payload: Payload | null) =>
      setState(initialBallotState(candidateIds, algorithms, payload)),
    [candidateIds, algorithms],
  )

  const displayOrder = useMemo(
    () => displayRanking(state, candidateIds),
    [state, candidateIds],
  )
  const blockingErrors = useMemo(
    () => getBlockingErrors(state, template, candidateIds, includeFptp),
    [state, template, candidateIds, includeFptp],
  )

  const getPayload = useCallback(
    () => buildSubmitPayload(state, template, candidateIds, includeFptp),
    [state, template, candidateIds, includeFptp],
  )
  const checkZeroApprovals = useCallback(
    () => hasZeroApprovals(state, template, candidateIds),
    [state, template, candidateIds],
  )

  return {
    state,
    template,
    candidateIds,
    displayOrder,
    blockingErrors,
    getPayload,
    hasZeroApprovals: checkZeroApprovals,
    setScore: handleScore,
    reorderRanking: handleReorderRanking,
    reorderScored: handleReorderScored,
    toggleApproval: handleToggleApproval,
    setFptpChoice: handleFptpChoice,
    setApprovalCutoff: handleApprovalCutoff,
    setApprovalTopK: handleApprovalTopK,
    merge: handleMerge,
    reset: handleReset,
  }
}

export type UseBallotState = ReturnType<typeof useBallotState>

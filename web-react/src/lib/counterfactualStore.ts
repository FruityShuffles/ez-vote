import { create } from 'zustand'

import { payloadsEqual } from '@/lib/ballot'
import type { Payload } from '@shared/derive'

interface CounterfactualLedgerState {
  electionId: string | null
  edits: Record<string, Payload>
  /**
   * voter_ids whose edit is a verbatim server flip-search suggestion. Any
   * manual action on a voter — editing, undoing — drops its marker: the
   * suggestion is only "applied" while the payload is exactly the server's.
   */
  flipApplied: Record<string, true>
  /** Switching elections starts a new hypothetical; route changes within one do not. */
  selectElection: (electionId: string) => void
  recordEdit: (voterId: string, original: Payload, payload: Payload) => void
  removeEdit: (voterId: string) => void
  /**
   * Install a flip-search change set as the whole ledger, replacing any
   * existing edits. Replacement is deliberate: the search ran on the baseline
   * ballots, so only the unmixed change set is guaranteed to show the flip.
   */
  applyFlipChanges: (changes: { voterId: string; payload: Payload }[]) => void
  reset: () => void
}

function withoutFlipMark(
  flipApplied: Record<string, true>,
  voterId: string,
): Record<string, true> {
  if (!(voterId in flipApplied)) return flipApplied
  const next = { ...flipApplied }
  delete next[voterId]
  return next
}

export const useCounterfactualStore = create<CounterfactualLedgerState>(
  (set) => ({
    electionId: null,
    edits: {},
    flipApplied: {},
    selectElection: (electionId) =>
      set((state) =>
        state.electionId === electionId
          ? state
          : { electionId, edits: {}, flipApplied: {} },
      ),
    recordEdit: (voterId, original, payload) =>
      set((state) => {
        if (payloadsEqual(original, payload)) {
          if (!(voterId in state.edits)) return state
          const edits = { ...state.edits }
          delete edits[voterId]
          return { edits, flipApplied: withoutFlipMark(state.flipApplied, voterId) }
        }
        if (
          payloadsEqual(state.edits[voterId], payload) &&
          !(voterId in state.flipApplied)
        ) {
          return state
        }
        return {
          edits: { ...state.edits, [voterId]: payload },
          flipApplied: withoutFlipMark(state.flipApplied, voterId),
        }
      }),
    removeEdit: (voterId) =>
      set((state) => {
        if (!(voterId in state.edits)) return state
        const edits = { ...state.edits }
        delete edits[voterId]
        return { edits, flipApplied: withoutFlipMark(state.flipApplied, voterId) }
      }),
    applyFlipChanges: (changes) =>
      set(() => ({
        edits: Object.fromEntries(
          changes.map(({ voterId, payload }) => [voterId, payload]),
        ),
        flipApplied: Object.fromEntries(
          changes.map(({ voterId }) => [voterId, true as const]),
        ),
      })),
    reset: () => set({ edits: {}, flipApplied: {} }),
  }),
)

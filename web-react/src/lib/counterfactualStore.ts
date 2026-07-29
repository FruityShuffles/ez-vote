import { create } from 'zustand'

import { payloadsEqual } from '@/lib/ballot'
import type { Payload } from '@shared/derive'

interface CounterfactualLedgerState {
  electionId: string | null
  edits: Record<string, Payload>
  /** Switching elections starts a new hypothetical; route changes within one do not. */
  selectElection: (electionId: string) => void
  recordEdit: (voterId: string, original: Payload, payload: Payload) => void
  removeEdit: (voterId: string) => void
  reset: () => void
}

export const useCounterfactualStore = create<CounterfactualLedgerState>(
  (set) => ({
    electionId: null,
    edits: {},
    selectElection: (electionId) =>
      set((state) =>
        state.electionId === electionId ? state : { electionId, edits: {} },
      ),
    recordEdit: (voterId, original, payload) =>
      set((state) => {
        if (payloadsEqual(original, payload)) {
          if (!(voterId in state.edits)) return state
          const edits = { ...state.edits }
          delete edits[voterId]
          return { edits }
        }
        if (payloadsEqual(state.edits[voterId], payload)) return state
        return { edits: { ...state.edits, [voterId]: payload } }
      }),
    removeEdit: (voterId) =>
      set((state) => {
        if (!(voterId in state.edits)) return state
        const edits = { ...state.edits }
        delete edits[voterId]
        return { edits }
      }),
    reset: () => set({ edits: {} }),
  }),
)

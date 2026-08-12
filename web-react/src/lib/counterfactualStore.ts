import { create } from 'zustand'

import { payloadsEqual } from '@/lib/ballot'
import type { Payload } from '@shared/derive'

interface CounterfactualLedgerState {
  electionId: string | null
  edits: Record<string, Payload>
  /**
   * Exact scenario installed by the last accepted search suggestion. This is
   * scenario-level provenance: any manual mutation clears it globally while
   * leaving the resulting working payloads as ordinary what-if edits.
   */
  activeSuggestion: Record<string, Payload> | null
  /** Switching elections starts a new hypothetical; route changes within one do not. */
  selectElection: (electionId: string) => void
  recordEdit: (voterId: string, original: Payload, payload: Payload) => void
  removeEdit: (voterId: string) => void
  /**
   * Install a search suggestion as the entire working scenario. Reapplying is
   * exact: unrelated edits are removed and every suggested replacement returns.
   */
  applySuggestion: (changes: { voterId: string; payload: Payload }[]) => void
  reset: () => void
}

export const useCounterfactualStore = create<CounterfactualLedgerState>(
  (set) => ({
    electionId: null,
    edits: {},
    activeSuggestion: null,
    selectElection: (electionId) =>
      set((state) =>
        state.electionId === electionId
          ? state
          : { electionId, edits: {}, activeSuggestion: null },
      ),
    recordEdit: (voterId, original, payload) =>
      set((state) => {
        if (payloadsEqual(original, payload)) {
          if (!(voterId in state.edits)) return state
          const edits = { ...state.edits }
          delete edits[voterId]
          return { edits, activeSuggestion: null }
        }
        if (payloadsEqual(state.edits[voterId], payload)) {
          return state
        }
        return {
          edits: { ...state.edits, [voterId]: payload },
          activeSuggestion: null,
        }
      }),
    removeEdit: (voterId) =>
      set((state) => {
        if (!(voterId in state.edits)) return state
        const edits = { ...state.edits }
        delete edits[voterId]
        return { edits, activeSuggestion: null }
      }),
    applySuggestion: (changes) =>
      set(() => {
        const scenario = Object.fromEntries(
          changes.map(({ voterId, payload }) => [voterId, payload]),
        )
        return { edits: scenario, activeSuggestion: scenario }
      }),
    reset: () => set({ edits: {}, activeSuggestion: null }),
  }),
)

import { create } from 'zustand'

// Placeholder Zustand store establishing the client-state pattern from the M4
// decision. Per that decision Zustand stays minimal — its real job is the
// in-progress ballot draft (M10). Replace/extend as surfaces land.
interface UiState {
  // Whether a global nav/menu surface is open. Trivial seed state for now.
  navOpen: boolean
  setNavOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  navOpen: false,
  setNavOpen: (open) => set({ navOpen: open }),
}))

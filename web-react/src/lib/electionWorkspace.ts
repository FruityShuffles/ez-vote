import { useOutletContext } from 'react-router-dom'

import type { Election } from '@/lib/elections'

export type ElectionWorkspaceContext = { election: Election }

export function useWorkspaceElection() {
  return useOutletContext<ElectionWorkspaceContext>().election
}

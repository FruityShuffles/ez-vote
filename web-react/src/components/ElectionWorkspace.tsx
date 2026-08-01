import { Outlet, useParams } from 'react-router-dom'

import { CenteredState } from '@/components/ui/centered-state'
import { Spinner } from '@/components/ui/spinner'
import { Muted } from '@/components/ui/typography'
import { useElection } from '@/lib/elections'

export function ElectionWorkspace() {
  const { id = '' } = useParams<{ id: string }>()
  const election = useElection(id)

  if (election.isPending) {
    return (
      <CenteredState>
        <Spinner className="size-6 text-muted-foreground" />
      </CenteredState>
    )
  }
  if (election.isError || !election.data) {
    return (
      <CenteredState>
        <Muted role="alert">Could not load election. Please try again.</Muted>
      </CenteredState>
    )
  }

  return <Outlet context={{ election: election.data }} />
}

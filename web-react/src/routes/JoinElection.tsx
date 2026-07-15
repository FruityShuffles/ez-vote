import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/ui/app-shell'
import { Spinner } from '@/components/ui/spinner'
import { useJoinElection } from '@/lib/elections'

// Join screen for the `/election/:id/join` deep link (the copied/QR invite
// link). Ported from Flutter `JoinElectionScreen`: join on mount, then fall
// through to the election detail regardless of outcome — `join_election` is
// idempotent, so a re-join (or any failure) is ignored. The route is behind
// RequireAuth, which threads `redirect=` through login → signup so the visitor
// lands back here after authenticating (INV-04).

export function JoinElection() {
  const { id } = useParams<{ id: string }>()
  const electionId = id ?? ''
  const navigate = useNavigate()
  const joinElection = useJoinElection()
  // Fire the join exactly once, even under StrictMode's double-mount.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || electionId === '') return
    started.current = true
    // `mutate` callbacks are tied to a MutationObserver. React StrictMode
    // temporarily unmounts that observer during its development-only effect
    // replay, so an `onSettled` callback can be lost even though the RPC
    // succeeded. The promise itself survives that replay.
    void joinElection
      .mutateAsync(electionId)
      // Ignore errors (e.g. already a member) — fall through to detail.
      .finally(() => navigate(`/election/${electionId}`, { replace: true }))
  }, [electionId, joinElection, navigate])

  return (
    <AppShell width="md">
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    </AppShell>
  )
}

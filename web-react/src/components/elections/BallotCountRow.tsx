import { CircleAlert, Vote } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Muted } from '@/components/ui/typography'
import { useBallotCount, useElectionVoters } from '@/lib/elections'

// Ballot-count affordance ported from Flutter `_BallotCountRow`. Two parity
// guarantees ride on it:
//   • DET-07 — the count reflects submitted ballots ("N ballots submitted").
//   • DET-04 — for the owner, a *failed* count fetch must show an error
//     indicator, never a silent "0" (closing on a false "0 votes" is
//     irreversible). So `isError` renders a marker rather than falling through.
// Tapping opens the voter-name list (Flutter's bottom sheet → a Dialog here).

export function BallotCountRow({ electionId }: { electionId: string }) {
  const { data, isPending, isError } = useBallotCount(electionId)

  // Match Flutter: nothing while the first fetch is in flight (avoids a flash).
  if (isPending) return null
  if (isError) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        role="alert"
      >
        <CircleAlert className="size-4 text-destructive" aria-hidden />
        Couldn't load ballot count
      </span>
    )
  }

  const n = data
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex w-fit items-center gap-1.5 rounded-md py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          />
        }
      >
        <Vote className="size-4" aria-hidden />
        {n} ballot{n === 1 ? '' : 's'} submitted
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Voters</DialogTitle>
        </DialogHeader>
        <VotersList electionId={electionId} />
      </DialogContent>
    </Dialog>
  )
}

/** Read-only list of voters who have submitted. Public-ballot viewing (opening
 *  an individual ballot) is deferred to the ballot-screen port (M10/M12). */
function VotersList({ electionId }: { electionId: string }) {
  const { data, isPending, isError } = useElectionVoters(electionId)

  if (isPending) {
    return (
      <div className="flex justify-center py-4">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }
  if (isError) {
    return (
      <Muted role="alert">Couldn't load voters. Please try again.</Muted>
    )
  }
  if (data.length === 0) {
    return <Muted>No ballots submitted yet.</Muted>
  }
  return (
    <ul className="divide-y divide-border">
      {data.map((name, i) => (
        <li key={`${name}-${i}`} className="py-2 text-sm">
          {name}
        </li>
      ))}
    </ul>
  )
}

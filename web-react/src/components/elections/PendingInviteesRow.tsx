import { CircleAlert, UserPlus } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { usePendingInvitees } from '@/lib/elections'

// Pending-invitees affordance ported from Flutter `_PendingInviteesRow`. Like
// the ballot count, a failed fetch shows an error indicator rather than a silent
// empty (DET-04). When there are genuinely no pending invitees the row is hidden
// (matches Flutter's `SizedBox.shrink`). Inviting voters is M12 — this is the
// read-only "who hasn't voted yet" view only.

export function PendingInviteesRow({ electionId }: { electionId: string }) {
  const { data, isPending, isError } = usePendingInvitees(electionId)

  if (isPending) return null
  if (isError) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        role="alert"
      >
        <CircleAlert className="size-4 text-destructive" aria-hidden />
        Couldn't load pending invitees
      </span>
    )
  }
  if (data.length === 0) return null

  const n = data.length
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
        <UserPlus className="size-4" aria-hidden />
        {n} pending invitee{n === 1 ? '' : 's'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pending Invitees</DialogTitle>
        </DialogHeader>
        <ul className="divide-y divide-border">
          {data.map((name, i) => (
            <li key={`${name}-${i}`} className="py-2 text-sm">
              {name}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

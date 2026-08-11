import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleCheck, CircleDashed, Crown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { StatusBadge } from '@/components/elections/StatusBadge'
import { useBallotCount, useDeleteElection } from '@/lib/elections'
import type { Election } from '@/lib/elections'
import { useElectionResults, winnersLabel } from '@/lib/results'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'

// Dashboard list item ported from Flutter `_ElectionCard`. Subtitle joins
// description · "N ballots" · winner-label (closed only) with " · ". Tapping a
// draft jumps to its edit screen (M11), anything else to the detail screen
// (M9). Owned elections get a delete affordance with a confirm dialog.
//
// Since #134 the dashboard is one merged list, so the card also carries the
// viewer's relationship to the election as status icons: `owned` (which also
// gates the delete affordance) and `voteStatus`. `voteStatus` is nullable
// because it is genuinely unknown on a draft — and because the dashboard
// suppresses it rather than guess when the voted/invitation queries fail.

export type VoteStatus = 'voted' | 'not-voted'

export function ElectionCard({
  election,
  owned = false,
  voteStatus = null,
}: {
  election: Election
  owned?: boolean
  voteStatus?: VoteStatus | null
}) {
  const navigate = useNavigate()

  const { data: ballotCount } = useBallotCount(election.id)
  const isClosed = election.status === 'closed'
  const { data: results } = useElectionResults(election.id, {
    enabled: isClosed,
  })

  const subtitleParts = [
    election.description?.trim() ? election.description.trim() : null,
    ballotCount != null
      ? `${ballotCount} ballot${ballotCount === 1 ? '' : 's'}`
      : null,
    isClosed && results ? winnersLabel(results) : null,
  ].filter((part): part is string => part != null && part !== '')

  // Drafts aren't viewable (no ballot/results yet) — go straight to editing.
  const destination = election.status === 'draft'
    ? `/election/${election.id}/edit`
    : `/election/${election.id}`

  return (
    <Card className="transition-colors hover:bg-muted/40">
      <CardContent className="flex items-start gap-3">
        <button
          type="button"
          onClick={() =>
            navigate(destination, {
              state: { from: 'dashboard' },
            })
          }
          className={cn(
            'flex-1 rounded-md text-left outline-none',
            'focus-visible:ring-3 focus-visible:ring-ring/50',
          )}
        >
          <p className="font-medium">{election.title}</p>
          {subtitleParts.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {subtitleParts.join(' · ')}
            </p>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {owned && (
            <StatusIcon label="You created this election">
              <Crown className="size-4 text-muted-foreground" />
            </StatusIcon>
          )}
          {voteStatus === 'voted' && (
            <StatusIcon label="You've voted">
              <CircleCheck className="size-4 text-green-600" />
            </StatusIcon>
          )}
          {voteStatus === 'not-voted' && (
            <StatusIcon label="You haven't voted yet">
              <CircleDashed className="size-4 text-muted-foreground" />
            </StatusIcon>
          )}
          <StatusBadge status={election.status} />
          {owned && <DeleteButton election={election} />}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * An icon whose only text is its tooltip. The label is duplicated as the
 * element's accessible name so the meaning survives where tooltips don't fire —
 * touch, and assistive tech. Focusable so keyboard users can reach the tooltip
 * too, even though there is nothing to activate.
 */
function StatusIcon({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={label}
            tabIndex={0}
            className={cn(
              'flex size-8 items-center justify-center rounded-md outline-none',
              'focus-visible:ring-3 focus-visible:ring-ring/50',
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function DeleteButton({ election }: { election: Election }) {
  const [open, setOpen] = useState(false)
  const deleteElection = useDeleteElection()

  async function confirmDelete() {
    try {
      await deleteElection.mutateAsync(election.id)
      setOpen(false)
    } catch (e) {
      toast.error(friendlyError(e, 'Error deleting election. Please try again.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${election.title}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="text-destructive" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete election?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={deleteElection.isPending}
            onClick={() => void confirmDelete()}
          >
            {deleteElection.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

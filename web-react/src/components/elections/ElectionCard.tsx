import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
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

export function ElectionCard({
  election,
  deletable = false,
}: {
  election: Election
  deletable?: boolean
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
          onClick={() => navigate(destination)}
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
          <StatusBadge status={election.status} />
          {deletable && <DeleteButton election={election} />}
        </div>
      </CardContent>
    </Card>
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

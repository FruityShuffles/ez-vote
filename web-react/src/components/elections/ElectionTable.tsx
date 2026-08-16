import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, CircleDashed, Crown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { AlgorithmBadges } from '@/components/elections/AlgorithmBadges'
import { StatusBadge } from '@/components/elections/StatusBadge'
import { useBallotCount, useDeleteElection } from '@/lib/elections'
import type { Election } from '@/lib/elections'
import { useElectionResults, winnerNames } from '@/lib/results'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'

// The dashboard election lists (#147), replacing the one-card-per-election
// layout ported from Flutter `_ElectionCard`.
//
// Every value an election carries — winner, methods, ballot count, your
// relationship to it, status — used to be either appended to the description or
// floated in a right-aligned flex row, so nothing lined up between rows. Here a
// single grid template per variant drives both the header labels and every row,
// which is the whole point: the columns are what make the list scannable.
//
// Below `md` the columns collapse into three stacked lines (title + status /
// methods / everything else) rather than scrolling sideways. The header is
// visual only — `aria-hidden` — because it disappears at that width; each cell
// instead carries its own name via `sr-only` text or an existing tooltip label,
// so a row reads correctly out of column context.

export type VoteStatus = 'voted' | 'not-voted'

export interface ElectionTableRow {
  election: Election
  owned: boolean
  voteStatus: VoteStatus | null
}

type Variant = 'mine' | 'case-studies'

/**
 * Column geometry per variant. Case Studies drops the viewer columns — nobody
 * owns or is invited to a showcase election — which also shifts Status left,
 * so its placement is part of the config rather than a fixed class.
 *
 * Every track is either a fixed width or an `fr` share of the leftover, never
 * `auto` or `max-content`: the header and each row are separate grid
 * containers, so a content-sized track would resolve to a different width in
 * every row and nothing would line up — the one thing this layout exists for.
 */
const VARIANTS: Record<
  Variant,
  {
    grid: string
    statusColumn: string
    headers: { label: string; className?: string }[]
    viewerColumns: boolean
  }
> = {
  mine: {
    grid:
      'md:grid-cols-[minmax(0,2.6fr)_minmax(0,0.9fr)_13.5rem_3.5rem_3rem_3rem_4.5rem_2rem]',
    statusColumn: 'md:col-start-7',
    headers: [
      { label: 'Election' },
      { label: 'Winner' },
      { label: 'Methods' },
      { label: 'Ballots', className: 'text-right' },
      { label: 'Voted', className: 'text-center' },
      { label: 'Owner', className: 'text-center' },
      { label: 'Status' },
      { label: '' },
    ],
    viewerColumns: true,
  },
  'case-studies': {
    grid: 'md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)_13.5rem_3.5rem_4.5rem]',
    statusColumn: 'md:col-start-5',
    headers: [
      { label: 'Election' },
      { label: 'Winner' },
      { label: 'Methods' },
      { label: 'Ballots', className: 'text-right' },
      { label: 'Status' },
    ],
    viewerColumns: false,
  },
}

const ROW_PADDING = 'px-4 py-3'

export function ElectionTable({
  rows,
  variant,
  label,
}: {
  rows: ElectionTableRow[]
  variant: Variant
  label: string
}) {
  const config = VARIANTS[variant]

  return (
    <Card className="gap-0 py-0">
      <div
        aria-hidden
        className={cn(
          'hidden items-center gap-x-2 border-b px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid',
          config.grid,
        )}
      >
        {config.headers.map((header, i) => (
          <span key={i} className={header.className}>
            {header.label}
          </span>
        ))}
      </div>
      <ul aria-label={label} className="divide-y">
        {rows.map((row) => (
          <ElectionRow key={row.election.id} row={row} config={config} />
        ))}
      </ul>
    </Card>
  )
}

function ElectionRow({
  row,
  config,
}: {
  row: ElectionTableRow
  config: (typeof VARIANTS)[Variant]
}) {
  const { election, owned, voteStatus } = row
  const { data: ballotCount } = useBallotCount(election.id)
  const isClosed = election.status === 'closed'
  const { data: results } = useElectionResults(election.id, {
    enabled: isClosed,
  })
  const winners = isClosed && results ? winnerNames(results) : []

  // Drafts aren't viewable (no ballot/results yet) — go straight to editing.
  const destination =
    election.status === 'draft'
      ? `/election/${election.id}/edit`
      : `/election/${election.id}`

  return (
    <li
      className={cn(
        'relative isolate grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 transition-colors hover:bg-muted/40 md:gap-x-2',
        ROW_PADDING,
        config.grid,
      )}
    >
      {/* Title. The link stretches over the whole row, so the row is one click
          target and one tab stop; the controls below re-stack above it. */}
      <div className="col-start-1 row-start-1 min-w-0 md:col-start-1">
        <Link
          to={destination}
          state={{ from: 'dashboard' }}
          className={cn(
            'block truncate rounded-md font-medium outline-none',
            'after:absolute after:inset-0',
            'focus-visible:ring-3 focus-visible:ring-ring/50',
          )}
        >
          {election.title}
        </Link>
      </div>

      <div
        className={cn(
          'col-start-2 row-start-1 justify-self-end',
          config.statusColumn,
          'md:row-start-1 md:justify-self-start',
        )}
      >
        <StatusBadge status={election.status} />
      </div>

      <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-3 md:row-start-1">
        <AlgorithmBadges
          algorithms={election.algorithms}
          includeFptp={election.include_fptp}
        />
      </div>

      {/* Below `md` these share one wrapped meta line; at `md` the wrapper
          dissolves and each cell takes its own column. A cell with nothing to
          say drops out of the meta line entirely — an em-dash placeholder only
          means "empty" while a column header is there to name it — but keeps
          its column at `md` so the grid stays square. `max-md:ml-auto` on each
          trailing cell means whichever one survives pushes the group right. */}
      <div className="col-span-2 row-start-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm md:contents">
        <div
          className={cn(
            'min-w-0 truncate md:col-start-2 md:row-start-1',
            winners.length === 0 && 'max-md:hidden',
          )}
        >
          {winners.length > 0 ? (
            <>
              <span className="text-muted-foreground md:sr-only">Winner: </span>
              <span title={winners.join(' & ')}>{winners.join(' & ')}</span>
            </>
          ) : (
            <span aria-hidden className="text-muted-foreground">
              —
            </span>
          )}
        </div>

        <div
          className={cn(
            'tabular-nums md:col-start-4 md:row-start-1 md:text-right',
            ballotCount == null && 'max-md:hidden',
          )}
        >
          {ballotCount != null ? (
            <>
              {ballotCount}
              <span className="text-muted-foreground md:sr-only">
                {` ballot${ballotCount === 1 ? '' : 's'}`}
              </span>
            </>
          ) : (
            <span aria-hidden className="text-muted-foreground">
              —
            </span>
          )}
        </div>

        {config.viewerColumns && (
          // Nested `md:contents`: on mobile this is one right-pushed group, so
          // the icons stay together instead of each auto-margin claiming its
          // own share of the free space. At `md` it dissolves like its parent.
          <div className="flex items-center gap-x-3 max-md:ml-auto md:contents">
            <div
              className={cn(
                'flex justify-center md:col-start-5 md:row-start-1',
                voteStatus == null && 'max-md:hidden',
              )}
            >
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
            </div>

            <div
              className={cn(
                'flex justify-center md:col-start-6 md:row-start-1',
                !owned && 'max-md:hidden',
              )}
            >
              {owned && (
                <StatusIcon label="You created this election">
                  <Crown className="size-4 text-muted-foreground" />
                </StatusIcon>
              )}
            </div>

            <div
              className={cn(
                'flex justify-end md:col-start-8 md:row-start-1',
                !owned && 'max-md:hidden',
              )}
            >
              {owned && <DeleteButton election={election} />}
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * An icon whose only text is its tooltip. The label is duplicated as the
 * element's accessible name so the meaning survives where tooltips don't fire —
 * touch, and assistive tech. Focusable so keyboard users can reach the tooltip
 * too, even though there is nothing to activate. `relative` lifts it out from
 * under the row's stretched link.
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
              'relative flex size-8 items-center justify-center rounded-md outline-none',
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
        className="relative"
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

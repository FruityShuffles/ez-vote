import { Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The header over a ballot that already exists (#137).
//
// Both screens that edit an existing ballot use this one component: the real
// Edit Ballot screen (your own vote, in an open election) and the what-if editor
// (someone else's, hypothetically). They differ only in what the ballot is
// called and what undo means, so those are props — the count, the layout and the
// wording of the change line are shared, and cannot drift apart.
//
// `changeCount` counts the marked controls, not the consequences those controls
// have. It is deliberately the same number the reader can count on screen.

interface BallotChangeBannerProps {
  /** What this ballot is when nothing has been changed — e.g. "Their ballot". */
  restingLabel: string
  /** How many controls currently carry a baseline mark. */
  changeCount: number
  /** Sentence completed by the count, e.g. "since you voted". */
  changeSuffix: string
  onUndo: () => void
  undoLabel: string
  /** Offer undo even with no marks on screen — the what-if editor shows an
   *  unedited ballot while a server flip suggestion is pending for it. */
  undoAvailable?: boolean
  className?: string
}

export function BallotChangeBanner({
  restingLabel,
  changeCount,
  changeSuffix,
  onUndo,
  undoLabel,
  undoAvailable = false,
  className,
}: BallotChangeBannerProps) {
  const changed = changeCount > 0

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 px-1',
        className,
      )}
    >
      <p
        className="text-[11px] font-semibold tracking-[0.12em] uppercase"
        aria-live="polite"
      >
        {changed
          ? `${changeCount} change${changeCount === 1 ? '' : 's'} ${changeSuffix}`
          : restingLabel}
      </p>
      {(changed || undoAvailable) && (
        <Button variant="ghost" size="sm" onClick={onUndo}>
          <Undo2 aria-hidden /> {undoLabel}
        </Button>
      )}
    </div>
  )
}

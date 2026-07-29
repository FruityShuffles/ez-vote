import { Undo2 } from 'lucide-react'

import { BallotView } from '@/components/ballot/BallotView'
import { Button } from '@/components/ui/button'
import type { Candidate } from '@/lib/elections'
import type { UseBallotState } from '@/lib/useBallotState'

// The editable hypothetical ballot (M21, screen 2).
//
// It reuses `BallotView` outright — the ballot UI is already fully driven by
// `useBallotState` and renders identically here, so the seven templates, the
// tie-break drag order and the auto-score-zero behaviour all come for free and
// cannot drift from the real voting screen.
//
// The only thing added is the mark that this is provisional: a dashed edge and a
// faint hatch. That treatment is deliberately a TEXTURE, not a colour — it
// stays legible for colourblind users, survives the future dark-mode flip, and
// leaves the app's amber "winner" and indigo "changed" semantics untouched.

interface HypotheticalBallotProps {
  voterName: string
  ballot: UseBallotState
  candidates: Candidate[]
  includeFptp: boolean
  /** True once this ballot differs from the one the voter actually cast. */
  isEdited: boolean
  onRevert: () => void
}

export function HypotheticalBallot({
  voterName,
  ballot,
  candidates,
  includeFptp,
  isEdited,
  onRevert,
}: HypotheticalBallotProps) {
  return (
    <div className="hatch-hypothetical rounded-xl border border-dashed border-foreground/25 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-semibold tracking-[0.12em] uppercase">
          {isEdited ? 'Changed ballot' : 'Their ballot'}
        </p>
        {isEdited && (
          <Button variant="ghost" size="sm" onClick={onRevert}>
            <Undo2 aria-hidden /> Undo changes
          </Button>
        )}
      </div>

      <BallotView
        ballot={ballot}
        candidates={candidates}
        includeFptp={includeFptp}
        viewOnly={false}
        zeroApprovalFlash={false}
      />

      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Changes here are hypothetical. {voterName}&apos;s real ballot is
        untouched.
      </p>
    </div>
  )
}

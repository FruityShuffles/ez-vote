import { BallotChangeBanner } from '@/components/ballot/BallotChangeBanner'
import { BallotView } from '@/components/ballot/BallotView'
import type { BaselineMarks } from '@/lib/ballotBaseline'
import type { Candidate } from '@/lib/elections'
import type { UseBallotState } from '@/lib/useBallotState'

// The editable hypothetical ballot (M21, screen 2).
//
// It reuses `BallotView` outright — the ballot UI is already fully driven by
// `useBallotState` and renders identically here, so the seven templates, the
// tie-break drag order and the auto-score-zero behaviour all come for free and
// cannot drift from the real voting screen. The baseline marks (#137) arrive the
// same way: `BallotView` draws them, so what "this is where it was" looks like is
// identical to the real Edit Ballot screen.
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
  /** Controls that have left the ballot this voter actually cast. */
  marks: BaselineMarks
  /** How many of those controls are marked — the banner's count. */
  changeCount: number
  /** True once this voter has a pending edit in the ledger. Usually implied by
   *  `changeCount`, but not when the pending edit is an untouched server flip
   *  suggestion — the editor shows the original ballot in that case. */
  isEdited: boolean
  onRevert: () => void
}

export function HypotheticalBallot({
  voterName,
  ballot,
  candidates,
  includeFptp,
  marks,
  changeCount,
  isEdited,
  onRevert,
}: HypotheticalBallotProps) {
  return (
    <div className="hatch-hypothetical rounded-xl border border-dashed border-foreground/25 p-3">
      <BallotChangeBanner
        className="mb-2"
        restingLabel="Their ballot"
        changeCount={changeCount}
        changeSuffix="to their ballot"
        onUndo={onRevert}
        undoLabel="Undo changes"
        undoAvailable={isEdited}
      />

      <BallotView
        ballot={ballot}
        candidates={candidates}
        includeFptp={includeFptp}
        viewOnly={false}
        zeroApprovalFlash={false}
        marks={marks}
      />

      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Changes here are hypothetical. {voterName}&apos;s real ballot is
        untouched.
      </p>
    </div>
  )
}

import { cn } from '@/lib/utils'
import type { BallotEntry } from '@/lib/counterfactualFilter'

// A whole ballot as one scannable line: candidates left-to-right in that
// ballot's own order, approved ones filled, scores trailing.
//
// It exists so the picker answers "whose ballot is worth changing?" without
// opening anything. A lone top-choice column can't — the leverage in a
// counterfactual usually sits in the *second* preference, which is exactly what
// a top-choice column hides.
//
// Order carries the rank, so there are no position numbers: the strip is read
// like a sentence, and numbering three chips would be decoration rather than
// information.

interface BallotFingerprintProps {
  entries: BallotEntry[]
  nameOf: (candidateId: string) => string
  /** `now` is the hypothetical side, and carries the dashed provisional mark. */
  tone?: 'plain' | 'was' | 'now'
  /**
   * Candidates this hypothetical touched. They take the indigo outline — the
   * same "this is what moved" device the rail puts around a changed method,
   * applied one level down.
   */
  changedIds?: Set<string>
  /** Chips past this are collapsed into a "+n" counter. */
  max?: number
  /** Describes the change for assistive tech, since the marking is visual. */
  label?: string
  className?: string
}

const TONE_LABELS: Record<'was' | 'now', string> = { was: 'was', now: 'now' }

export function BallotFingerprint({
  entries,
  nameOf,
  tone = 'plain',
  changedIds,
  max = 5,
  label,
  className,
}: BallotFingerprintProps) {
  const shown = entries.slice(0, max)
  const hidden = entries.length - shown.length

  return (
    <div
      aria-label={label}
      className={cn('flex min-w-0 items-center gap-1.5', className)}
    >
      {tone !== 'plain' && (
        <>
          <span className="w-7 shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
            {TONE_LABELS[tone]}
          </span>
          <span
            aria-hidden
            className={cn(
              'h-4 shrink-0 self-stretch border-l',
              tone === 'now' ? 'border-dashed border-foreground/40' : 'border-border',
            )}
          />
        </>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {shown.map((entry) => (
          <span
            key={entry.candidateId}
            data-changed={changedIds?.has(entry.candidateId) ? 'true' : undefined}
            className={cn(
              // Every chip carries a border, transparent when approved, so the
              // changed marking is a single colour swap that works identically on
              // both variants and shifts nothing.
              'inline-flex items-center gap-1 rounded-4xl border border-transparent px-1.5 py-px text-[11px] whitespace-nowrap',
              entry.approved
                ? 'bg-secondary text-secondary-foreground'
                : 'border-border text-muted-foreground',
              changedIds?.has(entry.candidateId) &&
                'border-primary font-medium text-foreground ring-1 ring-primary/30',
            )}
          >
            {nameOf(entry.candidateId)}
            {entry.score != null && (
              <span className="tabular-nums opacity-70">{entry.score}</span>
            )}
          </span>
        ))}
        {hidden > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            +{hidden}
          </span>
        )}
      </div>
    </div>
  )
}

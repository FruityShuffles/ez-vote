import { RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The edit ledger (M21): every hypothetical change made so far, removable.
//
// It is what makes a counterfactual reversible and legible instead of a state
// you can get lost in, and it is the surface the deferred "minimum changes to
// flip the outcome" search (#120) will render its answer into — the same shape,
// filled in by the server rather than by hand.

export interface LedgerEntry {
  voterId: string
  voterName: string
  /** Short phrases from `summarizeChange`; empty for a removed ballot. */
  phrases: string[]
  op: 'replace' | 'remove'
}

interface EditLedgerProps {
  entries: LedgerEntry[]
  onRemove: (voterId: string) => void
  onReset: () => void
  /** Jump back to a voter's ballot from its chip. */
  onSelect?: (voterId: string) => void
  /**
   * `summary` drops the per-edit chips, keeping the count and Reset all. Used on
   * the picker, where each changed row already carries its own diff and undo —
   * repeating them here would be the same information twice on one screen.
   */
  variant?: 'full' | 'summary'
  className?: string
}

export function EditLedger({
  entries,
  onRemove,
  onReset,
  onSelect,
  variant = 'full',
  className,
}: EditLedgerProps) {
  return (
    <section
      aria-label="Your changes"
      className={cn(
        'rounded-lg border border-dashed border-border bg-muted/30 p-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase">
          Your changes{entries.length > 0 && ` (${entries.length})`}
        </h3>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw aria-hidden /> Reset all
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Change someone&apos;s ballot to see which methods care.
        </p>
      ) : variant === 'summary' ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {entries.length === 1
            ? '1 ballot changed. Its row shows what moved.'
            : `${entries.length} ballots changed. Each row shows what moved.`}
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <li key={entry.voterId}>
              <span className="inline-flex items-center gap-1 rounded-4xl border border-dashed border-border bg-card py-0.5 pr-0.5 pl-2.5 text-xs">
                <ChipLabel entry={entry} onSelect={onSelect} />
                <button
                  type="button"
                  onClick={() => onRemove(entry.voterId)}
                  aria-label={`Undo the change to ${entry.voterName}'s ballot`}
                  className="rounded-4xl p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ChipLabel({
  entry,
  onSelect,
}: {
  entry: LedgerEntry
  onSelect?: (voterId: string) => void
}) {
  const summary =
    entry.op === 'remove'
      ? 'ballot removed'
      : (entry.phrases[0] ?? 'edited')
  const extra = entry.op === 'remove' ? 0 : Math.max(0, entry.phrases.length - 1)

  const text = (
    <>
      <span className="font-medium">{entry.voterName}</span>
      <span className="text-muted-foreground"> · {summary}</span>
      {extra > 0 && (
        <span className="text-muted-foreground"> +{extra} more</span>
      )}
    </>
  )

  if (onSelect == null || entry.op === 'remove') {
    return <span className="max-w-[22rem] truncate">{text}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.voterId)}
      className="max-w-[22rem] truncate rounded-sm hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {text}
    </button>
  )
}

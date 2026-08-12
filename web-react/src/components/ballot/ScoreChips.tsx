import { cn } from '@/lib/utils'

// A 0–5 STAR score selector for one candidate (templates B/E/F/G). Rendered as a
// radiogroup of chips so it's keyboard- and screen-reader-navigable (the canvas
// Flutter ChoiceChips were not) — a core reason for the migration.

const SCORES = [0, 1, 2, 3, 4, 5] as const

export function ScoreChips({
  value,
  onChange,
  disabled,
  label,
  baselineValue,
}: {
  value: number
  onChange: (score: number) => void
  disabled?: boolean
  label: string
  /** The score this candidate was actually given, when it differs (#137). */
  baselineValue?: number | null
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Score for ${label}`}
      className="flex flex-wrap gap-1.5"
    >
      {SCORES.map((n) => {
        const selected = value === n
        // The chip that held the cast score keeps a dotted outline while the
        // voter is somewhere else, so "where it was" is visible without a
        // caption. It is never both selected and baseline — `baselineValue` is
        // only supplied when the score has actually moved.
        const isBaseline = baselineValue === n
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={isBaseline ? `${n}, your original score` : `${n}`}
            data-baseline={isBaseline ? 'true' : undefined}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'flex size-9 items-center justify-center rounded-lg border text-sm font-medium tabular-nums outline-none transition-colors',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'disabled:pointer-events-none disabled:opacity-60',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background hover:bg-muted',
              isBaseline && 'mark-baseline border-2 text-foreground',
            )}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

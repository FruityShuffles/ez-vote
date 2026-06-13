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
}: {
  value: number
  onChange: (score: number) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Score for ${label}`}
      className="flex flex-wrap gap-1.5"
    >
      {SCORES.map((n) => {
        const selected = value === n
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${n}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'flex size-9 items-center justify-center rounded-lg border text-sm font-medium tabular-nums outline-none transition-colors',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'disabled:pointer-events-none disabled:opacity-60',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background hover:bg-muted',
            )}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

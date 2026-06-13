import { Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'

// A bounded +/- numeric stepper, used for the approval top-K (templates D/G) and
// the approval score cutoff (template E). Ported from the Flutter stepper cards.

export function Stepper({
  value,
  min,
  max,
  onChange,
  disabled,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Minus />
      </Button>
      <span
        className="min-w-6 text-center text-base font-medium tabular-nums"
        aria-live="polite"
        aria-label={`${label}: ${value}`}
      >
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  )
}

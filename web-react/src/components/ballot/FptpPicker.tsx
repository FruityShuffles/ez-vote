import { useEffect } from 'react'

import type { Candidate } from '@/lib/elections'
import { Field, FieldLabel } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { H3, Muted } from '@/components/ui/typography'

// Inline first-past-the-post picker (templates B/C/E when `include_fptp`). The
// FPTP choice is constrained to candidates the voter already supports — the
// top-scored (B/E) or the approved (C) — so it stays consistent with the rest of
// the ballot (BAL-06). A single eligible candidate is auto-selected and shown
// read-only; two or more present a radio choice (BAL-07). Empty ⇒ nothing to
// pick, render nothing. Ported from `_buildInlineFptpPicker`.

export function FptpPicker({
  eligible,
  value,
  onChange,
  disabled,
}: {
  eligible: Candidate[]
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
}) {
  const onlyId = eligible.length === 1 ? eligible[0].id : null

  // Auto-select the sole eligible candidate. (For B/E the state's
  // `autoFptpFromScores` already does this; this covers template C, which has no
  // score-driven auto-select.)
  useEffect(() => {
    if (!disabled && onlyId != null && value !== onlyId) onChange(onlyId)
  }, [disabled, onlyId, value, onChange])

  if (eligible.length === 0) return null

  return (
    <div className="mt-4">
      <Separator className="mb-3" />
      <H3 className="text-sm">First Choice (FPTP)</H3>
      {eligible.length === 1 ? (
        <Muted className="mt-1">Your first choice: {eligible[0].name}</Muted>
      ) : (
        <>
          <Muted className="mt-1">
            If this were a simple plurality election, which single candidate would
            you pick?
          </Muted>
          <RadioGroup
            className="mt-2"
            value={value ?? ''}
            onValueChange={(v) => onChange((v as string) || null)}
            disabled={disabled}
          >
            {eligible.map((c) => (
              <Field key={c.id} orientation="horizontal">
                <RadioGroupItem value={c.id} id={`fptp-${c.id}`} />
                <FieldLabel htmlFor={`fptp-${c.id}`}>{c.name}</FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </>
      )}
    </div>
  )
}

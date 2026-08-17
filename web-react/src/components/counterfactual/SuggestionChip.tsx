import { summarizeChange } from '@/lib/counterfactualFilter'
import type { Payload } from '@shared/derive'

// The edit ledger's chip shape, filled in by the server rather than by hand:
// read-only, no undo. Shared by both server-suggestion panels — the flip search
// (#135) and the strategic voting search (#149) — so a suggested change reads
// identically wherever it comes from, and identically to a change the reader
// made themselves.
//
// `detail` is the one thing that differs between the two: the flip search
// measures its changes in adjacent transpositions, while the strategic search
// reports how many voters cast the same ballot. Neither belongs in this
// component's vocabulary, so both arrive as text.

export interface SuggestionChipProps {
  /** The voter's real ballot, for the diff. */
  original: Payload
  /** The suggested ballot — a full payload, as the endpoint returns it. */
  payload: Payload
  nameOf: (candidateId: string) => string
  voterName: string
  /** Trailing metadata, e.g. "3 swaps". Omitted when there is nothing to say. */
  detail?: string
}

export function SuggestionChip({
  original,
  payload,
  nameOf,
  voterName,
  detail,
}: SuggestionChipProps) {
  const phrases = summarizeChange(original, payload, nameOf)
  const summary = phrases[0] ?? 'edited'
  const extra = Math.max(0, phrases.length - 1)

  return (
    <span className="inline-flex items-center rounded-4xl border border-dashed border-border bg-card px-2.5 py-0.5 text-xs">
      <span className="max-w-[22rem] truncate">
        <span className="font-medium">{voterName}</span>
        <span className="text-muted-foreground"> · {summary}</span>
        {extra > 0 && (
          <span className="text-muted-foreground"> +{extra} more</span>
        )}
        {detail != null && (
          <span className="text-muted-foreground"> · {detail}</span>
        )}
      </span>
    </span>
  )
}

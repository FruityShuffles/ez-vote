import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Muted } from '@/components/ui/typography'
import { payloadsEqual } from '@/lib/ballot'
import { flipTargetHeadline, joinNames } from '@/lib/counterfactual'
import { summarizeChange } from '@/lib/counterfactualFilter'
import { cn } from '@/lib/utils'
import type { Payload } from '@shared/derive'
import type {
  FlipAlgorithmResult,
  FlipChange,
  FlipSearchResult,
  FlipTarget,
} from '@shared/flip'

// The flip-search surface (#135): "what would it take to change this outcome?",
// answered by the server's `find_flip` search (#120) and rendered in the edit
// ledger's visual shape — the same chips, filled in by the server rather than
// by hand.
//
// The search is user-initiated (a button, never automatic): it costs up to
// ~500 ms of server compute, and most explorer sessions never need it. Its
// copy follows the server's honesty contract — see `flipTargetHeadline`.

export interface FlipSearchPanelProps {
  result: FlipSearchResult | undefined
  pending: boolean
  error: Error | null
  requested: boolean
  onSearch: () => void
  /** Canonical baseline payloads by voter_id, for `summarizeChange` diffs. */
  originals: Map<string, Payload>
  nameOf: (candidateId: string) => string
  voterNameOf: (voterId: string) => string
  /** The live ledger, for the staleness note and the applied-state check. */
  edits: Record<string, Payload>
  activeSuggestion: Record<string, Payload> | null
  onApply: (changes: { voterId: string; payload: Payload }[]) => void
  /** When set, the search is unavailable; render this explanation instead. */
  unavailableReason?: string
  className?: string
}

export function FlipSearchPanel({
  result,
  pending,
  error,
  requested,
  onSearch,
  originals,
  nameOf,
  voterNameOf,
  edits,
  activeSuggestion,
  onApply,
  unavailableReason,
  className,
}: FlipSearchPanelProps) {
  const irv = result?.algorithms.find(
    (algorithm) => algorithm.algorithm === 'irv',
  )
  const hasEdits = Object.keys(edits).length > 0

  return (
    <section
      aria-label="Flip the outcome"
      className={cn(
        'rounded-lg border border-dashed border-border bg-muted/30 p-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase">
            Flip the outcome
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unavailableReason ??
              'What would it take to make someone else the IRV winner?'}
          </p>
        </div>
        {unavailableReason == null && irv == null && (
          <Button variant="outline" onClick={onSearch} disabled={pending}>
            {pending && <Spinner className="size-4" />}
            {pending ? 'Searching…' : 'Run the search'}
          </Button>
        )}
      </div>

      {unavailableReason == null && !requested && (
        <p className="mt-1 text-xs text-muted-foreground">
          Searches for the smallest ballot changes it can find. Runs on the
          ballots as actually voted.
        </p>
      )}

      {error != null && (
        <Muted role="alert" className="mt-2 block">
          {error.message}
        </Muted>
      )}

      {irv != null && (
        <FlipResults
          irv={irv}
          budgetExhausted={result?.budget_exhausted === true}
          originals={originals}
          nameOf={nameOf}
          voterNameOf={voterNameOf}
          edits={edits}
          activeSuggestion={activeSuggestion}
          hasEdits={hasEdits}
          onApply={onApply}
        />
      )}
    </section>
  )
}

function FlipResults({
  irv,
  budgetExhausted,
  originals,
  nameOf,
  voterNameOf,
  edits,
  activeSuggestion,
  hasEdits,
  onApply,
}: {
  irv: FlipAlgorithmResult
  budgetExhausted: boolean
  originals: Map<string, Payload>
  nameOf: (candidateId: string) => string
  voterNameOf: (voterId: string) => string
  edits: Record<string, Payload>
  activeSuggestion: Record<string, Payload> | null
  hasEdits: boolean
  onApply: (changes: { voterId: string; payload: Payload }[]) => void
}) {
  const targets = sortTargets(irv.targets)

  return (
    <div className="mt-2">
      {irv.baseline_winners.length > 0 && (
        <p className="text-sm">
          {irv.baseline_winners.length > 1
            ? `As voted, ${joinNames(irv.baseline_winners)} tie for the IRV win.`
            : `As voted, ${irv.baseline_winners[0]} wins IRV.`}
        </p>
      )}
      {hasEdits && (
        <p className="mt-1 text-xs text-muted-foreground">
          Computed from the ballots as actually voted — your current what-ifs
          are not included.
        </p>
      )}
      {budgetExhausted && (
        <p className="mt-1 text-xs text-muted-foreground">
          The search hit its compute budget, so some answers below may be
          missing or improvable.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {targets.map((target) => (
          <FlipTargetRow
            key={target.candidate_id}
            target={target}
            isBest={target.candidate_id === irv.best}
            originals={originals}
            nameOf={nameOf}
            voterNameOf={voterNameOf}
            applied={isTargetApplied(target, edits, activeSuggestion)}
            hasEdits={hasEdits}
            onApply={onApply}
          />
        ))}
      </ul>
    </div>
  )
}

/** Flipped answers first, cheapest (k, then total distance) on top. */
function sortTargets(targets: FlipTarget[]): FlipTarget[] {
  const statusRank: Record<FlipTarget['status'], number> = {
    flipped: 0,
    no_flip_found: 1,
    budget_exhausted: 2,
  }
  return [...targets].sort((a, b) => {
    if (a.status !== b.status)
      return statusRank[a.status] - statusRank[b.status]
    if (a.status !== 'flipped') return 0
    if (a.k !== b.k) return (a.k ?? 0) - (b.k ?? 0)
    return totalDistance(a) - totalDistance(b)
  })
}

function totalDistance(target: FlipTarget): number {
  return (target.changes ?? []).reduce(
    (sum, change) => sum + change.distance,
    0,
  )
}

/**
 * A target counts as applied only while the ledger is exactly its change set,
 * verbatim. Derived from the store, never held locally, so undoing a chip or
 * hand-editing a ballot immediately un-applies it.
 */
function isTargetApplied(
  target: FlipTarget,
  edits: Record<string, Payload>,
  activeSuggestion: Record<string, Payload> | null,
): boolean {
  const changes = target.changes ?? []
  if (
    target.status !== 'flipped' ||
    changes.length === 0 ||
    activeSuggestion == null
  ) {
    return false
  }
  return (
    Object.keys(edits).length === changes.length &&
    Object.keys(activeSuggestion).length === changes.length &&
    changes.every(
      (change) =>
        payloadsEqual(activeSuggestion[change.voter_id], change.payload) &&
        payloadsEqual(edits[change.voter_id], change.payload),
    )
  )
}

function FlipTargetRow({
  target,
  isBest,
  originals,
  nameOf,
  voterNameOf,
  applied,
  hasEdits,
  onApply,
}: {
  target: FlipTarget
  isBest: boolean
  originals: Map<string, Payload>
  nameOf: (candidateId: string) => string
  voterNameOf: (voterId: string) => string
  applied: boolean
  hasEdits: boolean
  onApply: (changes: { voterId: string; payload: Payload }[]) => void
}) {
  const changes = target.changes ?? []

  return (
    <li
      className={cn(
        'rounded-md bg-card p-2.5 tabular-nums ring-1 ring-border',
        isBest && 'ring-2 ring-primary',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {isBest && (
          <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
            Cheapest found
          </span>
        )}
        <p className="text-sm">{flipTargetHeadline(target)}</p>
      </div>

      {changes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {changes.map((change) => (
            <li key={change.voter_id}>
              <FlipChangeChip
                change={change}
                original={originals.get(change.voter_id) ?? {}}
                nameOf={nameOf}
                voterName={voterNameOf(change.voter_id)}
              />
            </li>
          ))}
        </ul>
      )}

      {target.status === 'flipped' && changes.length > 0 && (
        <div className="mt-2">
          {applied ? (
            <p className="text-xs text-muted-foreground">
              Applied — the changes are in your ledger and the rail shows the
              result.
            </p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onApply(
                  changes.map((change) => ({
                    voterId: change.voter_id,
                    payload: change.payload,
                  })),
                )
              }
            >
              <Sparkles aria-hidden />
              {hasEdits ? `Replace my changes with these` : `Try these changes`}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** The edit ledger's chip shape, filled in by the server: read-only, no undo. */
function FlipChangeChip({
  change,
  original,
  nameOf,
  voterName,
}: {
  change: FlipChange
  original: Payload
  nameOf: (candidateId: string) => string
  voterName: string
}) {
  const phrases = summarizeChange(original, change.payload, nameOf)
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
        <span className="text-muted-foreground">
          {' '}
          · {change.distance === 1 ? '1 swap' : `${change.distance} swaps`}
        </span>
      </span>
    </span>
  )
}

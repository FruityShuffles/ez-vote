import { Sparkles } from 'lucide-react'

import { SuggestionChip } from '@/components/counterfactual/SuggestionChip'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Muted } from '@/components/ui/typography'
import { payloadsEqual } from '@/lib/ballot'
import {
  ALGORITHM_SHORT_LABELS,
  strategyHeadline,
} from '@/lib/counterfactual'
import { cn } from '@/lib/utils'
import type { Payload } from '@shared/derive'
import type {
  StrategicOpportunity,
  StrategicSearchResult,
} from '@shared/strategy'

// The strategic voting surface (#149): "could any voter have gotten a better
// outcome by voting differently?", answered per method by the server's search
// and rendered in the edit ledger's visual shape — the same chips the reader
// fills in by hand, filled in by the server instead.
//
// Deliberately more prominent than the flip panel it sits above: solid card and
// border rather than the flip panel's dashed muted well. The issue ranks this
// question higher than the flip search, and it is the sharper lesson — the flip
// search asks what the electorate would have to do, this asks what one named
// person could have done alone.
//
// TWO THINGS THE COPY MUST NOT DO.
//
// It must not name the strategy. The search proved that a different ballot
// would have served this voter better; it proved nothing about intent, and
// "bullet vote" or "burial" would assert intent. The chip spells out the change
// and stops.
//
// It must not overclaim absence. Every finding here is proven — verified by
// re-tabulating with the ballot swapped in — but an empty panel means only that
// the search found nothing within its budget, never that the election was
// strategy-proof. See the header of `_shared/strategy.ts`.

const METHOD_ORDER = ['approval', 'irv', 'star', 'fptp'] as const

export interface StrategicVotingPanelProps {
  result: StrategicSearchResult | undefined
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

export function StrategicVotingPanel({
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
}: StrategicVotingPanelProps) {
  const hasEdits = Object.keys(edits).length > 0

  return (
    <section
      aria-label="Strategic voting"
      className={cn('rounded-lg border border-border bg-card p-3', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase">
            Could anyone have voted more cleverly?
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unavailableReason ??
              'Voters whose honest ballot cost them the outcome they wanted — and the ballot that would have served them better.'}
          </p>
        </div>
        {unavailableReason == null && result == null && (
          <Button variant="outline" onClick={onSearch} disabled={pending}>
            {pending && <Spinner className="size-4" />}
            {pending ? 'Searching…' : 'Run the search'}
          </Button>
        )}
      </div>

      {unavailableReason == null && result == null && !requested && (
        <p className="mt-1 text-xs text-muted-foreground">
          Checks each method on its own, holding every other ballot as voted.
        </p>
      )}

      {error != null && (
        <Muted role="alert" className="mt-2 block">
          {error.message}
        </Muted>
      )}

      {result != null && (
        <StrategyResults
          result={result}
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

function StrategyResults({
  result,
  originals,
  nameOf,
  voterNameOf,
  edits,
  activeSuggestion,
  hasEdits,
  onApply,
}: {
  result: StrategicSearchResult
  originals: Map<string, Payload>
  nameOf: (candidateId: string) => string
  voterNameOf: (voterId: string) => string
  edits: Record<string, Payload>
  activeSuggestion: Record<string, Payload> | null
  hasEdits: boolean
  onApply: (changes: { voterId: string; payload: Payload }[]) => void
}) {
  const groups = groupByMethod(result.opportunities)

  if (groups.length === 0) {
    return (
      <div className="mt-2">
        <p className="text-sm">
          No strategic voting opportunity found. This search can&apos;t try
          every possible ballot, so one may still exist.
        </p>
        {result.budget_exhausted && (
          <p className="mt-1 text-xs text-muted-foreground">
            It also hit its compute budget before finishing.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-3">
      {hasEdits && (
        <p className="text-xs text-muted-foreground">
          Computed from the ballots as actually voted — your current what-ifs
          are not included.
        </p>
      )}
      {result.budget_exhausted && (
        <p className="text-xs text-muted-foreground">
          The search hit its compute budget, so there may be more to find than
          is shown here.
        </p>
      )}

      {groups.map(([algorithm, opportunities]) => (
        <div key={algorithm}>
          <h4 className="text-xs font-semibold text-muted-foreground">
            {ALGORITHM_SHORT_LABELS[algorithm] ?? algorithm}
          </h4>
          <ul className="mt-1 space-y-2">
            {opportunities.map((opportunity) => (
              <StrategyRow
                key={`${opportunity.algorithm}:${opportunity.voter_id}`}
                opportunity={opportunity}
                original={originals.get(opportunity.voter_id) ?? {}}
                nameOf={nameOf}
                voterName={voterNameOf(opportunity.voter_id)}
                applied={isApplied(opportunity, edits, activeSuggestion)}
                hasEdits={hasEdits}
                onApply={onApply}
              />
            ))}
          </ul>
        </div>
      ))}

      {/* Where the isolation rule becomes visible to the reader: a finding is
          about one method, and says nothing about the others. */}
      <p className="text-xs text-muted-foreground">
        Each result changes one method&apos;s ballot only and leaves the other
        methods exactly as voted — real elections run one method at a time.
      </p>
    </div>
  )
}

/**
 * Findings grouped by method, in the app's usual method order. The server
 * already sorted by how much each voter gained, and that order is preserved
 * within each group.
 */
function groupByMethod(
  opportunities: StrategicOpportunity[],
): [string, StrategicOpportunity[]][] {
  return METHOD_ORDER.map(
    (algorithm) =>
      [
        algorithm as string,
        opportunities.filter(
          (opportunity) => opportunity.algorithm === algorithm,
        ),
      ] as [string, StrategicOpportunity[]],
  ).filter(([, group]) => group.length > 0)
}

/**
 * An opportunity counts as applied only while the ledger is exactly its one
 * change, verbatim. Derived from the store, never held locally, so undoing the
 * chip or hand-editing a ballot immediately un-applies it — the same rule the
 * flip panel uses.
 */
function isApplied(
  opportunity: StrategicOpportunity,
  edits: Record<string, Payload>,
  activeSuggestion: Record<string, Payload> | null,
): boolean {
  if (activeSuggestion == null) return false
  return (
    Object.keys(edits).length === 1 &&
    Object.keys(activeSuggestion).length === 1 &&
    payloadsEqual(
      activeSuggestion[opportunity.voter_id],
      opportunity.payload as Payload,
    ) &&
    payloadsEqual(edits[opportunity.voter_id], opportunity.payload as Payload)
  )
}

function StrategyRow({
  opportunity,
  original,
  nameOf,
  voterName,
  applied,
  hasEdits,
  onApply,
}: {
  opportunity: StrategicOpportunity
  original: Payload
  nameOf: (candidateId: string) => string
  voterName: string
  applied: boolean
  hasEdits: boolean
  onApply: (changes: { voterId: string; payload: Payload }[]) => void
}) {
  return (
    <li className="rounded-md bg-card p-2.5 tabular-nums ring-1 ring-border">
      <p className="text-sm">{strategyHeadline(opportunity, voterName)}</p>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        <li>
          <SuggestionChip
            original={original}
            payload={opportunity.payload as Payload}
            nameOf={nameOf}
            voterName={voterName}
            detail={
              opportunity.shared_by > 1
                ? `${opportunity.shared_by} voters cast this ballot`
                : undefined
            }
          />
        </li>
      </ul>

      <div className="mt-2">
        {applied ? (
          <p className="text-xs text-muted-foreground">
            Applied — the change is in your ledger and the rail shows the
            result.
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onApply([
                {
                  voterId: opportunity.voter_id,
                  payload: opportunity.payload as Payload,
                },
              ])
            }
          >
            <Sparkles aria-hidden />
            {hasEdits ? 'Replace my changes with this' : 'Try this ballot'}
          </Button>
        )}
      </div>
    </li>
  )
}

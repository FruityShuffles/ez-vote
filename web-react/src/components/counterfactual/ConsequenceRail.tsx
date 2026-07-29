import { Card, CardContent } from '@/components/ui/card'
import { Stack } from '@/components/ui/layout'
import { cn } from '@/lib/utils'
import { sortResults, winnersOf } from '@/lib/results'
import {
  ALGORITHM_METRIC_LABELS,
  ALGORITHM_READS,
  ALGORITHM_SHORT_LABELS,
  describeOutcomeShift,
  metricOf,
  roundCountOf,
  unmovedMetricNote,
  type TabulationResult,
} from '@/lib/counterfactual'

// The consequence rail (M21) — the one element this feature is remembered by.
// Four methods react to the same edit at the same time, and the divergence is
// the point: change one ranking and IRV can flip while Approval sits still.
//
// Design rules this file is responsible for holding:
//   • Reaction is signalled by CONTRAST, not a new hue — methods that didn't
//     move desaturate, the one that did goes full-strength. No red/green on
//     deltas: a vote shift is neither good nor bad.
//   • Every number is `tabular-nums`. These update live and proportional digits
//     make the whole rail jitter on each edit.
//   • The rail NEVER unmounts while refetching. Blanking it to a spinner
//     destroys the very comparison the feature exists for — hence `pending`
//     rendering as a hairline over stale-but-visible numbers.

interface ConsequenceRailProps {
  baseline: TabulationResult[]
  simulated: TabulationResult[]
  /** Per algorithm, from the endpoint: did the winners change? */
  changed: Record<string, boolean>
  /** False before the first edit — the rail then shows the real result plainly. */
  hasEdits: boolean
  /** A simulation is in flight; keep showing the previous numbers. */
  pending?: boolean
  /**
   * `compact` drops the per-candidate numbers, leaving each method's outcome and
   * whether it moved. Used on the picker screen, where the rail is orientation
   * rather than analysis and four full breakdowns would bury the voter list.
   */
  variant?: 'full' | 'compact'
  /** Anchor for `ConsequenceSummaryBar`'s jump-to-rail affordance. */
  id?: string
  className?: string
}

export function ConsequenceRail({
  baseline,
  simulated,
  changed,
  hasEdits,
  pending = false,
  variant = 'full',
  id,
  className,
}: ConsequenceRailProps) {
  const baseByAlgorithm = new Map(baseline.map((r) => [r.algorithm, r]))
  const pairs = sortResults(simulated).map((result) => ({
    result,
    base: baseByAlgorithm.get(result.algorithm) ?? result,
    didChange: hasEdits && changed[result.algorithm] === true,
  }))

  return (
    <section
      id={id}
      aria-label="Effect on each voting method"
      className={className}
    >
      <Stack gap={3}>
        <div className="relative">
          {pending && (
            <div
              role="status"
              aria-label="Updating results"
              className="absolute inset-x-0 -top-2 h-0.5 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none"
            />
          )}
          <h3 className="font-heading text-sm font-semibold">
            {hasEdits ? 'With your changes' : 'The real result'}
          </h3>
          {hasEdits && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing here is saved. The real results are unchanged.
            </p>
          )}
        </div>

        {pairs.map(({ result, base, didChange }) => (
          <MethodStrip
            key={result.algorithm}
            result={result}
            base={base}
            didChange={didChange}
            hasEdits={hasEdits}
            compact={variant === 'compact'}
          />
        ))}
      </Stack>
    </section>
  )
}

function MethodStrip({
  result,
  base,
  didChange,
  hasEdits,
  compact,
}: {
  result: TabulationResult
  base: TabulationResult
  didChange: boolean
  hasEdits: boolean
  compact: boolean
}) {
  const { algorithm } = result
  const label = ALGORITHM_SHORT_LABELS[algorithm] ?? algorithm
  const reads = ALGORITHM_READS[algorithm]

  const simulatedWinners = winnersOf(result.result_data)
  const baselineWinners = winnersOf(base.result_data)

  const outcome = didChange
    ? describeOutcomeShift(baselineWinners, simulatedWinners)
    : plainOutcome(simulatedWinners)

  const baseRounds = roundCountOf(base)
  const simRounds = roundCountOf(result)
  const roundShift =
    didChange &&
    baseRounds != null &&
    simRounds != null &&
    baseRounds !== simRounds
      ? `${baseRounds} round${baseRounds === 1 ? '' : 's'} → ${simRounds}`
      : null

  const rows = metricRows(result, base)
  // A flip with no movement in the headline numbers is the feature's sharpest
  // lesson, and reads as a contradiction unless it's named.
  const explainer =
    didChange && rows.every((r) => r.value === r.was)
      ? unmovedMetricNote(algorithm)
      : null

  return (
    <Card
      size="sm"
      data-algorithm={algorithm}
      data-changed={didChange ? 'true' : 'false'}
      className={cn(
        'transition-colors motion-reduce:transition-none',
        didChange
          ? 'ring-2 ring-primary'
          : hasEdits && 'bg-card/60 text-muted-foreground ring-foreground/5',
      )}
    >
      <CardContent>
        <Stack gap={2}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase">
              {label}
            </span>
            {hasEdits &&
              (didChange ? (
                <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold tracking-wide text-primary-foreground uppercase">
                  Changed
                </span>
              ) : (
                <span className="text-[10px] tracking-wide uppercase">
                  Unchanged
                </span>
              ))}
          </div>

          {reads && !compact && (
            <p className="-mt-1.5 text-[11px] text-muted-foreground">{reads}</p>
          )}

          <p
            key={outcome}
            className={cn(
              'animate-in fade-in text-sm leading-snug font-semibold duration-200 motion-reduce:animate-none motion-safe:slide-in-from-bottom-1',
              didChange && 'text-foreground',
            )}
          >
            {outcome}
          </p>

          {explainer && (
            <p className="text-xs leading-snug text-muted-foreground">
              {explainer}
            </p>
          )}

          {roundShift && <p className="text-xs tabular-nums">{roundShift}</p>}

          {!compact && (
            <MetricRows
              rows={rows}
              metricLabel={ALGORITHM_METRIC_LABELS[algorithm]}
              hasEdits={hasEdits}
              dim={hasEdits && !didChange}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

/**
 * Narrow-viewport companion to the rail.
 *
 * On a phone the rail stacks below the ballot, so the edit and its consequence
 * can't be seen at once — which is the whole feature. This pins the headline to
 * the bottom of the viewport so the feedback loop survives, and jumps to the
 * full rail on tap. Hidden until there's something to report.
 */
export function ConsequenceSummaryBar({
  baseline,
  simulated,
  changed,
  hasEdits,
  targetId,
  className,
}: Pick<
  ConsequenceRailProps,
  'baseline' | 'simulated' | 'changed' | 'hasEdits' | 'className'
> & {
  /** Element id of the full rail, scrolled into view on tap. */
  targetId: string
}) {
  if (!hasEdits) return null

  const baseByAlgorithm = new Map(baseline.map((r) => [r.algorithm, r]))
  const moved = sortResults(simulated).filter(
    (r) => changed[r.algorithm] === true,
  )

  let summary: string
  if (moved.length === 0) {
    summary = 'No method changed'
  } else if (moved.length === 1) {
    const only = moved[0]
    const label = ALGORITHM_SHORT_LABELS[only.algorithm] ?? only.algorithm
    const shift = describeOutcomeShift(
      winnersOf((baseByAlgorithm.get(only.algorithm) ?? only).result_data),
      winnersOf(only.result_data),
    )
    summary = `${label}: ${shift}`
  } else {
    summary = `${moved.length} methods change: ${moved
      .map((r) => ALGORITHM_SHORT_LABELS[r.algorithm] ?? r.algorithm)
      .join(', ')}`
  }

  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6',
        className,
      )}
    >
      <button
        type="button"
        onClick={() =>
          document
            .getElementById(targetId)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-semibold',
            moved.length === 0 && 'font-normal text-muted-foreground',
          )}
        >
          {summary}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">See all</span>
      </button>
    </div>
  )
}

/** "Winner: Alice" / "Tied: Alice & Bob" — matches the phrasing in `ResultsView`. */
function plainOutcome(winners: string[]): string {
  if (winners.length === 0) return 'No winner'
  return winners.length > 1
    ? `Tied: ${winners.join(' & ')}`
    : `Winner: ${winners[0]}`
}

interface MetricRow {
  name: string
  value: number
  was: number
}

/**
 * Pair each candidate's simulated number with its baseline, sorted by the
 * simulated value so the rail reorders to match the hypothetical standings
 * rather than the real ones.
 */
function metricRows(
  result: TabulationResult,
  base: TabulationResult,
): MetricRow[] {
  const simulated = metricOf(result)
  const baseline = metricOf(base)
  const names = [
    ...new Set([...Object.keys(simulated), ...Object.keys(baseline)]),
  ]

  return names
    .map((name) => ({
      name,
      value: simulated[name] ?? 0,
      was: baseline[name] ?? 0,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

/** The numbers, with deltas and a "was here" tick marking the baseline. */
function MetricRows({
  rows,
  metricLabel,
  hasEdits,
  dim,
}: {
  rows: MetricRow[]
  metricLabel?: string
  hasEdits: boolean
  dim: boolean
}) {
  if (rows.length === 0) return null

  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.was)))

  return (
    <div className="flex flex-col gap-1.5">
      {metricLabel && (
        <p className="text-[11px] text-muted-foreground">{metricLabel}</p>
      )}
      {rows.map(({ name, value, was }) => {
        const delta = value - was
        return (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">{name}</span>
              <span className="shrink-0 tabular-nums">
                <span
                  key={value}
                  className="animate-in fade-in duration-150 motion-reduce:animate-none"
                >
                  {value}
                </span>
                {hasEdits && delta !== 0 && (
                  <span
                    className="ml-1 text-muted-foreground"
                    title={`was ${was}`}
                  >
                    {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                  </span>
                )}
              </span>
            </div>
            <div
              className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
              aria-hidden
            >
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 motion-reduce:transition-none',
                  dim ? 'bg-foreground/20' : 'bg-[var(--chart-1)]',
                )}
                style={{ width: `${(value / max) * 100}%` }}
              />
              {hasEdits && delta !== 0 && (
                <span
                  className="absolute inset-y-0 w-px bg-foreground/60"
                  style={{ left: `${(was / max) * 100}%` }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

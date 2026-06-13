import { Award, Scale, Trophy } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Stack } from '@/components/ui/layout'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Muted } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { useElectionResults, winnersOf } from '@/lib/results'
import type { ElectionResult, IrvRound, ResultData } from '@/lib/results'

// Read-only port of `lib/presentation/widgets/results_view.dart` (M8). Renders
// each algorithm's `result_data` field-by-field (RES-02), in canonical order
// (RES-01, enforced by the data hook), plus an overall-winner summary (RES-04).
// The cross-method analysis card is intentionally **not** ported here — it is
// M16 (ANL-01). All keys in `result_data` are candidate names, not UUIDs (TAB-06).

const ALGORITHM_LABELS: Record<string, string> = {
  approval: 'Approval Voting',
  irv: 'Instant Runoff Voting (IRV)',
  star: 'STAR Voting',
  fptp: 'First Past The Post (FPTP)',
}

/** Container: fetches results and handles loading / error / empty states. */
export function ResultsView({ electionId }: { electionId: string }) {
  const { data, isPending, isError } = useElectionResults(electionId)

  if (isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (isError) {
    return <Muted role="alert">Couldn't load results. Please try again.</Muted>
  }
  return <ResultsList results={data} />
}

/**
 * Presentational results list. Split out from the container so it can be
 * rendered directly against the golden-corpus fixtures in tests.
 */
export function ResultsList({ results }: { results: ElectionResult[] }) {
  if (results.length === 0) {
    return <Muted>No results computed yet.</Muted>
  }

  const multiple = results.length > 1
  // Side-by-side on wider viewports, stacked on narrow (RES-05). Stacking implies
  // precedence, so multi-result layouts go to columns as soon as there's room.
  const columns =
    results.length >= 4
      ? 'lg:grid-cols-4'
      : results.length === 3
        ? 'lg:grid-cols-3'
        : 'lg:grid-cols-2'

  return (
    <Stack gap={4}>
      {multiple && <OverallWinnerCard results={results} />}
      {multiple ? (
        <div className={cn('grid grid-cols-1 items-start gap-4 sm:grid-cols-2', columns)}>
          {results.map((r) => (
            <ResultCard key={r.algorithm} result={r} />
          ))}
        </div>
      ) : (
        <ResultCard result={results[0]} />
      )}
    </Stack>
  )
}

/**
 * "Overall winner" across the selected algorithms (RES-04). FPTP is excluded —
 * it's a reference comparison, not a scored method. Hidden when there's no clear
 * consensus (ported rules from `_OverallWinnerCard`).
 */
function OverallWinnerCard({ results }: { results: ElectionResult[] }) {
  const wins: Record<string, number> = {}
  const scoredResults = results.filter((r) => r.algorithm !== 'fptp')
  for (const r of scoredResults) {
    const winners = winnersOf(r.result_data)
    for (const name of winners) {
      wins[name] = (wins[name] ?? 0) + 1
    }
  }

  const names = Object.keys(wins)
  if (names.length === 0) return null

  const maxWins = Math.max(...names.map((n) => wins[n]))
  const leaders = names.filter((n) => wins[n] === maxWins)

  // No meaningful overall result if everyone is tied or the leader won only once.
  if (maxWins < 2 && scoredResults.length > 2) return null
  if (leaders.length > 1) return null

  const overallWinner = leaders[0]
  const isMajority = maxWins > scoredResults.length / 2
  const label = isMajority ? 'Overall Majority Winner' : 'Overall Plurality Winner'
  const subtitle = `${overallWinner} won ${maxWins} of ${scoredResults.length} algorithms`

  return (
    <Card className="border-amber-300 bg-amber-50 ring-amber-300">
      <CardContent>
        <div className="flex items-center gap-3">
          <Award className="size-8 shrink-0 text-amber-500" aria-hidden />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-amber-800">{label}</span>
            <span className="text-lg font-bold">{overallWinner}</span>
            <span className="text-[13px] text-muted-foreground">{subtitle}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** One algorithm's result card with its winner header and per-method detail. */
function ResultCard({ result }: { result: ElectionResult }) {
  const data = result.result_data
  const label = ALGORITHM_LABELS[result.algorithm] ?? result.algorithm

  const winners = data.winners
  const isTie = winners != null && winners.length > 1
  const displayWinner = isTie
    ? winners.join(' & ')
    : (winners?.[0] ?? data.winner ?? null)
  const runnerUp = data.runner_up ?? null
  const runnerUpSuppressed =
    winners != null && runnerUp != null && winners.includes(runnerUp)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent>
        <Stack gap={3}>
          {displayWinner != null && (
            <div className="flex items-center gap-2">
              {isTie ? (
                <Scale className="size-5 shrink-0 text-amber-500" aria-hidden />
              ) : (
                <Trophy className="size-5 shrink-0 text-amber-500" aria-hidden />
              )}
              <span className="font-bold">
                {isTie ? `Tied: ${displayWinner}` : `Winner: ${displayWinner}`}
              </span>
            </div>
          )}
          {runnerUp != null && !runnerUpSuppressed && (
            <p className="text-sm">Runner-up: {runnerUp}</p>
          )}
          {result.algorithm === 'approval' && (
            <TallyDetails label="Approval Counts:" tallies={data.tallies ?? {}} />
          )}
          {result.algorithm === 'fptp' && (
            <TallyDetails label="Vote Counts:" tallies={data.tallies ?? {}} />
          )}
          {result.algorithm === 'irv' && <IrvDetails rounds={data.rounds ?? []} />}
          {result.algorithm === 'star' && <StarDetails data={data} />}
        </Stack>
      </CardContent>
    </Card>
  )
}

/** Approval / FPTP tallies as labelled proportional bars. */
function TallyDetails({
  label,
  tallies,
}: {
  label: string
  tallies: Record<string, number>
}) {
  const entries = Object.entries(tallies).sort((a, b) => b[1] - a[1])
  const maxCount = Math.max(1, ...entries.map(([, v]) => v))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      {entries.map(([name, count]) => (
        <div key={name} className="flex flex-col gap-1">
          <span className="text-sm">
            {name}: {count}
          </span>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-[var(--chart-1)]"
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** IRV round-by-round elimination. */
function IrvDetails({ rounds }: { rounds: IrvRound[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Round-by-round elimination:</p>
      {rounds.map((round, i) => {
        const eliminated = round.eliminated
        return (
          <Card key={i} size="sm" className="bg-muted/40 ring-foreground/5">
            <CardContent>
              <p className="font-bold">Round {i + 1}</p>
              {Object.entries(round.counts ?? {}).map(([name, count]) => (
                <p key={name} className="pl-3 text-sm">
                  {name}: {count}
                </p>
              ))}
              {eliminated != null && eliminated.length > 0 && (
                <p className="pl-3 text-sm italic text-destructive">
                  Eliminated: {eliminated.join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/** STAR score totals and the automatic runoff. */
function StarDetails({ data }: { data: ResultData }) {
  const scores = Object.entries(data.scores ?? {}).sort((a, b) => b[1] - a[1])
  const runoff = data.runoff

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">Score Totals:</p>
      {scores.map(([name, value]) => (
        <p key={name} className="pl-3 text-sm">
          {name}: {value}
        </p>
      ))}
      {runoff != null && (
        <>
          <p className="mt-2 text-sm font-medium">Runoff:</p>
          {Object.entries(runoff).map(([name, value]) => (
            <p key={name} className="pl-3 text-sm">
              {name}: {value} preferences
            </p>
          ))}
        </>
      )}
    </div>
  )
}

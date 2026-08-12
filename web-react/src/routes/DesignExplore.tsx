import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Stack } from '@/components/ui/layout'
import { H1, Muted } from '@/components/ui/typography'
import { BallotPicker } from '@/components/counterfactual/BallotPicker'
import {
  ConsequenceRail,
  ConsequenceSummaryBar,
} from '@/components/counterfactual/ConsequenceRail'
import { EditLedger, type LedgerEntry } from '@/components/counterfactual/EditLedger'
import { HypotheticalBallot } from '@/components/counterfactual/HypotheticalBallot'
import { summarizeChange, voterName } from '@/lib/counterfactualFilter'
import type { TabulationResult } from '@/lib/counterfactual'
import type { Candidate } from '@/lib/elections'
import {
  canonicalPayload as canonicalise,
  getTemplate,
} from '@/lib/ballotState'
import {
  baselineMarks,
  buildBaseline,
  countBaselineMarks,
} from '@/lib/ballotBaseline'
import { useBallotState } from '@/lib/useBallotState'
import type { Payload } from '@shared/derive'
import { diffWinners } from '@shared/counterfactual'
import { tabulate } from '@shared/tabulate'

// Design surface for the what-if explorer (M21), alongside `/design`. Unlinked
// and unguarded: it exists so the layout, the diff language and every rail state
// can be reviewed without manufacturing a real election.
//
// It tabulates LOCALLY via the shared `tabulate()` / `diffWinners()` helpers —
// the very same modules `simulate-counterfactual` runs server-side — so what you
// see here matches what the endpoint returns. The shipped feature calls the
// endpoint instead; nothing about this route implies results are computed in the
// browser.

const CANDIDATES: Candidate[] = [
  { id: 'ada', election_id: 'demo', name: 'Ada', position: 0, created_at: '' },
  { id: 'bo', election_id: 'demo', name: 'Bo', position: 1, created_at: '' },
  { id: 'cy', election_id: 'demo', name: 'Cy', position: 2, created_at: '' },
]

const ALGORITHMS = ['approval', 'irv', 'star']
const INCLUDE_FPTP = true

interface DemoBallot {
  voter_id: string
  display_name: string | null
  payload: Payload
}

/**
 * Nine ballots tuned to demonstrate the point of the feature: the four methods
 * already disagree at baseline (Approval says Ada; IRV, STAR and FPTP say Bo),
 * and it takes *two* voters re-ordering a tie before IRV flips. One edit changes
 * nothing — which is the honest, more interesting lesson.
 */
const BALLOTS: DemoBallot[] = [
  {
    voter_id: 'v1',
    display_name: 'Priya Menon',
    payload: { star: { ada: 5, bo: 1, cy: 0 }, irv: ['ada', 'bo', 'cy'], approval: ['ada'] },
  },
  {
    voter_id: 'v2',
    display_name: 'Sam Okafor',
    payload: { star: { ada: 5, bo: 2, cy: 1 }, irv: ['ada', 'bo', 'cy'], approval: ['ada'] },
  },
  {
    voter_id: 'v3',
    display_name: 'Dana Kim',
    payload: { star: { ada: 4, cy: 2, bo: 1 }, irv: ['ada', 'cy', 'bo'], approval: ['ada', 'cy'] },
  },
  {
    voter_id: 'v4',
    display_name: 'Eli Rosen',
    payload: { star: { bo: 5, ada: 1, cy: 0 }, irv: ['bo', 'ada', 'cy'], approval: ['bo', 'ada'] },
  },
  {
    voter_id: 'v5',
    display_name: 'Tom Alvarez',
    payload: { star: { bo: 5, cy: 1, ada: 0 }, irv: ['bo', 'cy', 'ada'], approval: ['bo'] },
  },
  {
    voter_id: 'v6',
    display_name: 'Ivy Chen',
    payload: { star: { bo: 4, ada: 3, cy: 0 }, irv: ['bo', 'ada', 'cy'], approval: ['bo', 'ada'] },
  },
  {
    voter_id: 'v7',
    display_name: 'Raj Patel',
    payload: { star: { bo: 4, cy: 3, ada: 2 }, irv: ['bo', 'cy', 'ada'], approval: ['bo'] },
  },
  {
    // Ada and Bo are tied at 3 on this ballot; the saved order breaks the tie
    // toward Bo. Dragging Ada above Bo changes the IRV ranking and nothing else.
    voter_id: 'v8',
    display_name: 'Nia Sorensen',
    payload: { star: { cy: 5, ada: 3, bo: 3 }, irv: ['cy', 'bo', 'ada'], approval: ['cy'] },
  },
  {
    voter_id: 'v9',
    display_name: 'Leo Fischer',
    payload: { star: { cy: 5, ada: 2, bo: 2 }, irv: ['cy', 'bo', 'ada'], approval: ['cy'] },
  },
]

const CANDIDATE_IDS = CANDIDATES.map((c) => c.id)
const TEMPLATE = getTemplate(ALGORITHMS)

/**
 * A stored payload as the ballot editor would re-emit it untouched.
 *
 * Comparing an edited payload against the raw fixture would report spurious
 * changes: loading a ballot re-derives its approval list and ranking from
 * scores, so the round-tripped form can differ from what was written by hand.
 * Diffing against this canonical form means "revert" reliably reads as no change.
 */
function canonicalPayload(payload: Payload): Payload {
  return canonicalise(payload, ALGORITHMS, CANDIDATE_IDS, INCLUDE_FPTP)
}

const ORIGINAL_PAYLOADS = new Map(
  BALLOTS.map((b) => [b.voter_id, canonicalPayload(b.payload)]),
)

/** The same ballot with the tied pair re-ordered toward Ada. */
function swapTiedPair(payload: Payload): Payload {
  return canonicalPayload({ ...payload, irv: ['cy', 'ada', 'bo'] })
}

const SCENARIOS: { label: string; overrides: Record<string, Payload> }[] = [
  { label: 'No changes', overrides: {} },
  {
    label: 'One voter re-orders a tie',
    overrides: { v8: swapTiedPair(BALLOTS[7].payload) },
  },
  {
    label: 'Two voters — IRV flips',
    overrides: {
      v8: swapTiedPair(BALLOTS[7].payload),
      v9: swapTiedPair(BALLOTS[8].payload),
    },
  },
]

export function DesignExplore() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Payload>>({})

  const nameOf = useCallback(
    (id: string) => CANDIDATES.find((c) => c.id === id)?.name ?? 'Removed candidate',
    [],
  )

  const { baseline, simulated, changed } = useMemo(() => {
    const original = BALLOTS.map((b) => ({ payload: b.payload }))
    const hypothetical = BALLOTS.map((b) => ({
      payload: edits[b.voter_id] ?? b.payload,
    }))
    const base = tabulate(ALGORITHMS, INCLUDE_FPTP, CANDIDATES, original)
    const sim = tabulate(ALGORITHMS, INCLUDE_FPTP, CANDIDATES, hypothetical)
    return {
      baseline: base as unknown as TabulationResult[],
      simulated: sim as unknown as TabulationResult[],
      changed: diffWinners(base, sim),
    }
  }, [edits])

  /** The picker needs both sides of each change to render its inline diff. */
  const pendingEdits = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(edits).map(([voterId, payload]) => [
          voterId,
          { original: ORIGINAL_PAYLOADS.get(voterId) ?? {}, payload },
        ]),
      ),
    [edits],
  )

  const undo = useCallback((voterId: string) => {
    setEdits((prev) => {
      if (!(voterId in prev)) return prev
      const next = { ...prev }
      delete next[voterId]
      return next
    })
  }, [])

  const ledger: LedgerEntry[] = useMemo(
    () =>
      Object.entries(edits).map(([voterId, payload]) => ({
        voterId,
        voterName: voterName(
          BALLOTS.find((b) => b.voter_id === voterId) ?? { display_name: null },
        ),
        phrases: summarizeChange(
          ORIGINAL_PAYLOADS.get(voterId) ?? {},
          payload,
          nameOf,
        ),
        op: 'replace' as const,
      })),
    [edits, nameOf],
  )

  const recordEdit = useCallback((voterId: string, payload: Payload) => {
    const original = JSON.stringify(ORIGINAL_PAYLOADS.get(voterId) ?? {})
    const next = JSON.stringify(payload)
    setEdits((prev) => {
      if (next === original) {
        if (!(voterId in prev)) return prev
        const cleared = { ...prev }
        delete cleared[voterId]
        return cleared
      }
      if (prev[voterId] != null && JSON.stringify(prev[voterId]) === next) return prev
      return { ...prev, [voterId]: payload }
    })
  }, [])

  const selected = BALLOTS.find((b) => b.voter_id === selectedId) ?? null
  const hasEdits = ledger.length > 0

  return (
    <Stack gap={4}>
        <div>
          <H1>What-if explorer</H1>
          <Muted className="mt-1">
            Design prototype (M21). Nine mock ballots, tabulated in the browser
            with the same helpers the edge function runs.
          </Muted>
        </div>

        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((scenario) => (
            <Button
              key={scenario.label}
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedId(null)
                setEdits({ ...scenario.overrides })
              }}
            >
              {scenario.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0">
            {selected == null ? (
              <BallotPicker
                ballots={BALLOTS}
                candidates={CANDIDATES}
                edits={pendingEdits}
                onSelect={setSelectedId}
                onUndo={undo}
              />
            ) : (
              <Stack gap={3}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 w-fit"
                  onClick={() => setSelectedId(null)}
                >
                  <ChevronLeft aria-hidden /> All voters
                </Button>
                <BallotEditor
                  key={selected.voter_id}
                  ballot={selected}
                  seedPayload={
                    edits[selected.voter_id] ??
                    ORIGINAL_PAYLOADS.get(selected.voter_id) ??
                    selected.payload
                  }
                  onChange={recordEdit}
                  onRevert={() =>
                    setEdits((prev) => {
                      const next = { ...prev }
                      delete next[selected.voter_id]
                      return next
                    })
                  }
                  isEdited={selected.voter_id in edits}
                />
              </Stack>
            )}
          </div>

          <ConsequenceRail
            baseline={baseline}
            simulated={simulated}
            changed={changed}
            hasEdits={hasEdits}
            variant={selected == null ? 'compact' : 'full'}
            id="consequence-rail"
            className="lg:sticky lg:top-4"
          />
        </div>

        <EditLedger
          entries={ledger}
          onRemove={undo}
          onReset={() => setEdits({})}
          onSelect={setSelectedId}
          variant={selected == null ? 'summary' : 'full'}
        />

        <ConsequenceSummaryBar
          baseline={baseline}
          simulated={simulated}
          changed={changed}
          hasEdits={hasEdits}
          targetId="consequence-rail"
          className="lg:hidden"
        />
    </Stack>
  )
}

/**
 * Editable copy of one voter's ballot. Remounted per voter (`key`) so
 * `useBallotState`'s initial-state builder re-runs against the new payload.
 *
 * It seeds from the voter's *pending* hypothetical when there is one, not the
 * stored ballot — otherwise re-opening an edited ballot silently discards the
 * edit. Changes are reported upward on every state change; the parent decides
 * what counts as a change by diffing against the canonical original.
 */
function BallotEditor({
  ballot: source,
  seedPayload,
  isEdited,
  onChange,
  onRevert,
}: {
  ballot: DemoBallot
  seedPayload: Payload
  isEdited: boolean
  onChange: (voterId: string, payload: Payload) => void
  onRevert: () => void
}) {
  const ballot = useBallotState({
    candidates: CANDIDATES,
    algorithms: ALGORITHMS,
    includeFptp: INCLUDE_FPTP,
    existingPayload: seedPayload,
  })

  const { getPayload } = ballot

  useEffect(() => {
    onChange(source.voter_id, getPayload())
  }, [getPayload, onChange, source.voter_id])

  const marks = baselineMarks(
    buildBaseline(
      ORIGINAL_PAYLOADS.get(source.voter_id) ?? {},
      CANDIDATE_IDS,
      ALGORITHMS,
    ),
    ballot.state,
    TEMPLATE,
    CANDIDATE_IDS,
    INCLUDE_FPTP,
  )

  return (
    <HypotheticalBallot
      voterName={voterName(source)}
      ballot={ballot}
      candidates={CANDIDATES}
      includeFptp={INCLUDE_FPTP}
      marks={marks}
      changeCount={countBaselineMarks(marks)}
      isEdited={isEdited}
      onRevert={onRevert}
    />
  )
}

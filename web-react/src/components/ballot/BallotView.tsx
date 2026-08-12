import { useMemo } from 'react'
import { CheckIcon } from 'lucide-react'

import type { Candidate } from '@/lib/elections'
import type { UseBallotState } from '@/lib/useBallotState'
import { NO_BASELINE_MARKS, type BaselineMarks } from '@/lib/ballotBaseline'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { H3, Muted } from '@/components/ui/typography'
import { cn, ordinal } from '@/lib/utils'

import { ScoreChips } from './ScoreChips'
import { Stepper } from './Stepper'
import { FptpPicker } from './FptpPicker'
import { SortableList, SortableRow } from './SortableList'

// Presentational ballot, dispatched by template (A–G). All state lives in the
// `useBallotState` hook; this renders the right inputs for the algorithm
// combination and is otherwise stateless (so it renders identically in view-only
// mode with inputs disabled — BAL-16). Ported from the Flutter `_buildTemplate*`
// methods.
//
// It is also the single place the baseline marks (#137) are drawn, which is why
// both screens that edit an existing ballot — the real Edit Ballot screen and the
// what-if editor — get them from one implementation. See `@/lib/ballotBaseline`
// for the rules deciding which controls are marked.

interface BallotViewProps {
  ballot: UseBallotState
  candidates: Candidate[]
  includeFptp: boolean
  viewOnly: boolean
  /** Flash the approval section after a zero-approval submit attempt (BAL-12). */
  zeroApprovalFlash: boolean
  /** Controls whose value has left the ballot as cast (#137). Omit when there is
   *  no cast ballot to compare against — a first vote, or a read-only view. */
  marks?: BaselineMarks
}

export function BallotView({
  ballot,
  candidates,
  includeFptp,
  viewOnly,
  zeroApprovalFlash,
  marks = NO_BASELINE_MARKS,
}: BallotViewProps) {
  const byId = useMemo(() => {
    const map = new Map<string, Candidate>()
    for (const c of candidates) map.set(c.id, c)
    return map
  }, [candidates])
  const name = (id: string) => byId.get(id)?.name ?? '(removed)'

  const { template } = ballot

  switch (template) {
    case 'A':
      return (
        <RankedCard
          title="Rank the Candidates"
          help="Drag candidates into your preferred order. #1 is your top choice."
        >
          <RankList ballot={ballot} name={name} viewOnly={viewOnly} marks={marks} />
        </RankedCard>
      )
    case 'B':
      return (
        <ScoreCard
          ballot={ballot}
          candidates={candidates}
          viewOnly={viewOnly}
          marks={marks}
          footer={
            includeFptp ? (
              <FptpPicker
                eligible={topScored(ballot, candidates)}
                value={ballot.state.fptpChoice}
                onChange={ballot.setFptpChoice}
                disabled={viewOnly}
                baselineValue={marks.fptp}
              />
            ) : null
          }
        />
      )
    case 'C':
      return (
        <ApprovalCard
          ballot={ballot}
          candidates={candidates}
          viewOnly={viewOnly}
          flash={zeroApprovalFlash}
          marks={marks}
          footer={
            includeFptp ? (
              <FptpPicker
                eligible={candidates.filter((c) =>
                  ballot.state.approvals.includes(c.id),
                )}
                value={ballot.state.fptpChoice}
                onChange={ballot.setFptpChoice}
                disabled={viewOnly}
                baselineValue={marks.fptp}
              />
            ) : null
          }
        />
      )
    case 'D':
      return (
        <RankedCard
          title="Rank & Approve Candidates"
          help="Drag candidates into order, then choose how many of your top picks to approve."
        >
          <RankList
            ballot={ballot}
            name={name}
            viewOnly={viewOnly}
            marks={marks}
            approvedIds={ballot.state.rankings.slice(0, ballot.state.approvalTopK)}
          />
          <TopKStepper
            ballot={ballot}
            max={candidates.length}
            viewOnly={viewOnly}
            marks={marks}
          />
        </RankedCard>
      )
    case 'E':
      return (
        <ScoreCard
          ballot={ballot}
          candidates={candidates}
          viewOnly={viewOnly}
          flash={zeroApprovalFlash}
          marks={marks}
          footer={
            <>
              <CutoffStepper ballot={ballot} viewOnly={viewOnly} marks={marks} />
              {includeFptp && (
                <FptpPicker
                  eligible={topScored(ballot, candidates)}
                  value={ballot.state.fptpChoice}
                  onChange={ballot.setFptpChoice}
                  disabled={viewOnly}
                  baselineValue={marks.fptp}
                />
              )}
            </>
          }
        />
      )
    case 'F':
      return (
        <RankedCard
          title="Score the Candidates"
          help="Score each candidate 0–5. They sort by score; drag to set the order within a tie."
        >
          <ScoredSortableList
            ballot={ballot}
            name={name}
            viewOnly={viewOnly}
            marks={marks}
          />
        </RankedCard>
      )
    case 'G':
      return (
        <RankedCard
          title="Score & Approve Candidates"
          help="Score each candidate 0–5, drag to break ties, then choose how many top picks to approve."
        >
          <ScoredSortableList
            ballot={ballot}
            name={name}
            viewOnly={viewOnly}
            marks={marks}
            approvedIds={ballot.displayOrder.slice(0, ballot.state.approvalTopK)}
          />
          <TopKStepper
            ballot={ballot}
            max={candidates.length}
            viewOnly={viewOnly}
            marks={marks}
          />
        </RankedCard>
      )
    default:
      return null
  }
}

// ── Top-scored helper (FPTP eligibility for B/E) ──────────────────────────────

function topScored(ballot: UseBallotState, candidates: Candidate[]): Candidate[] {
  let max = 0
  for (const c of candidates) {
    const s = ballot.state.scores[c.id] ?? 0
    if (s > max) max = s
  }
  if (max === 0) return []
  return candidates.filter((c) => (ballot.state.scores[c.id] ?? 0) === max)
}

// ── Shared card shells ────────────────────────────────────────────────────────

function RankedCard({
  title,
  help,
  children,
}: {
  title: string
  help: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent>
        <H3 className="text-base">{title}</H3>
        <Muted className="mt-1 mb-3">{help}</Muted>
        {children}
      </CardContent>
    </Card>
  )
}

function PositionBadge({ index }: { index: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
      {index + 1}
    </span>
  )
}

function ApprovedBadge() {
  return (
    <Badge variant="secondary" className="ml-auto">
      Approved
    </Badge>
  )
}

/**
 * A hollow twin of a badge or value, carrying what the ballot actually held
 * (#137). Used where the original value has no control of its own to outline —
 * a position, a stepper reading — so the mark has to be drawn rather than
 * pointed at. The digits are decorative; the words are what a screen reader gets.
 */
function GhostBadge({ value, srLabel }: { value: number; srLabel: string }) {
  return (
    <span
      data-baseline="true"
      className="mark-baseline flex size-6 shrink-0 items-center justify-center rounded-full border-2 bg-background text-xs font-semibold text-muted-foreground tabular-nums"
    >
      <span aria-hidden>{value}</span>
      <span className="sr-only">{srLabel}</span>
    </span>
  )
}

// ── Ranked list (templates A / D — pure ranking) ──────────────────────────────

function RankList({
  ballot,
  name,
  viewOnly,
  approvedIds,
  marks,
}: {
  ballot: UseBallotState
  name: (id: string) => string
  viewOnly: boolean
  approvedIds?: string[]
  marks: BaselineMarks
}) {
  const ids = ballot.state.rankings
  const approved = new Set(approvedIds ?? [])
  return (
    <SortableList
      ids={ids}
      disabled={viewOnly}
      onReorder={(activeId, overId) =>
        ballot.reorderRanking(ids.indexOf(activeId), ids.indexOf(overId))
      }
    >
      {ids.map((id, index) => (
        <SortableRow key={id} id={id} disabled={viewOnly}>
          <div className="flex items-center gap-3">
            <PositionBadge index={index} />
            <BaselinePosition was={marks.positions[id]} />
            <span className="font-medium">{name(id)}</span>
            {approved.has(id) && <ApprovedBadge />}
          </div>
        </SortableRow>
      ))}
    </SortableList>
  )
}

function BaselinePosition({ was }: { was: number | undefined }) {
  if (was == null) return null
  return <GhostBadge value={was} srLabel={`was ${ordinal(was)}`} />
}

// ── Score-sorted sortable list (templates F / G) ──────────────────────────────

function ScoredSortableList({
  ballot,
  name,
  viewOnly,
  approvedIds,
  marks,
}: {
  ballot: UseBallotState
  name: (id: string) => string
  viewOnly: boolean
  approvedIds?: string[]
  marks: BaselineMarks
}) {
  const ids = ballot.displayOrder
  const approved = new Set(approvedIds ?? [])
  return (
    <SortableList
      ids={ids}
      disabled={viewOnly}
      onReorder={ballot.reorderScored}
    >
      {ids.map((id, index) => (
        <SortableRow key={id} id={id} disabled={viewOnly}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <PositionBadge index={index} />
              <BaselinePosition was={marks.positions[id]} />
              <span className="font-medium">{name(id)}</span>
              {approved.has(id) && <ApprovedBadge />}
            </div>
            <ScoreChips
              label={name(id)}
              value={ballot.state.scores[id] ?? 0}
              onChange={(score) => ballot.setScore(id, score)}
              disabled={viewOnly}
              baselineValue={marks.scores[id]}
            />
          </div>
        </SortableRow>
      ))}
    </SortableList>
  )
}

// ── Score card (templates B / E — flat scored list, no reordering) ────────────

function ScoreCard({
  ballot,
  candidates,
  viewOnly,
  flash,
  footer,
  marks,
}: {
  ballot: UseBallotState
  candidates: Candidate[]
  viewOnly: boolean
  flash?: boolean
  footer?: React.ReactNode
  marks: BaselineMarks
}) {
  return (
    <Card className={cn(flash && 'ring-2 ring-amber-400')}>
      <CardContent>
        <H3 className="text-base">Rate Each Candidate</H3>
        <Muted className="mt-1 mb-3">
          Give each candidate a score from 0 (no support) to 5 (strongest
          support).
        </Muted>
        {flash && (
          <p className="mb-3 text-sm font-medium text-amber-600">
            You haven&apos;t approved any candidates
          </p>
        )}
        <div className="flex flex-col gap-4">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="font-medium">{c.name}</span>
              <ScoreChips
                label={c.name}
                value={ballot.state.scores[c.id] ?? 0}
                onChange={(score) => ballot.setScore(c.id, score)}
                disabled={viewOnly}
                baselineValue={marks.scores[c.id]}
              />
            </div>
          ))}
        </div>
        {footer}
      </CardContent>
    </Card>
  )
}

// ── Approval card (template C) ────────────────────────────────────────────────

function ApprovalCard({
  ballot,
  candidates,
  viewOnly,
  flash,
  footer,
  marks,
}: {
  ballot: UseBallotState
  candidates: Candidate[]
  viewOnly: boolean
  flash: boolean
  footer?: React.ReactNode
  marks: BaselineMarks
}) {
  return (
    <Card className={cn(flash && 'ring-2 ring-amber-400')}>
      <CardContent>
        <H3 className="text-base">Approve Candidates</H3>
        <Muted className="mt-1 mb-3">
          Check every candidate you&apos;d be happy to see win.
        </Muted>
        {flash && (
          <p className="mb-3 text-sm font-medium text-amber-600">
            You haven&apos;t approved any candidates
          </p>
        )}
        <div className="flex flex-col gap-1">
          {candidates.map((c) => {
            // A checkbox has one control for both answers, so there is no second
            // box to outline: the box itself takes the mark, and a ghost tick
            // stands in for the state it used to be in.
            const wasApproved = marks.approvals[c.id]
            return (
              <Field key={c.id} orientation="horizontal" className="py-1">
                <span className="relative flex items-center">
                  <Checkbox
                    id={`approve-${c.id}`}
                    checked={ballot.state.approvals.includes(c.id)}
                    disabled={viewOnly}
                    onCheckedChange={() => ballot.toggleApproval(c.id)}
                    data-baseline={wasApproved != null ? 'true' : undefined}
                    className={cn(wasApproved != null && 'mark-baseline border-2')}
                  />
                  {wasApproved === true && (
                    <CheckIcon
                      aria-hidden
                      className="pointer-events-none absolute inset-0 m-auto size-3 text-muted-foreground"
                    />
                  )}
                </span>
                <FieldLabel htmlFor={`approve-${c.id}`}>
                  {c.name}
                  {/* Bracketed, and never asserted as an exact string: browsers
                      insert whitespace between the label's text nodes when they
                      compute the accessible name and jsdom does not. */}
                  {wasApproved != null && (
                    <span className="sr-only">
                      {wasApproved ? '(was approved)' : '(was not approved)'}
                    </span>
                  )}
                </FieldLabel>
              </Field>
            )
          })}
        </div>
        {footer}
      </CardContent>
    </Card>
  )
}

// ── Steppers ──────────────────────────────────────────────────────────────────

// Approvals on D/E/G fall out of these steppers rather than out of the rows, so
// the mark belongs here — badging every row the cutoff happens to cover would
// bury the one control the voter actually moved.

function TopKStepper({
  ballot,
  max,
  viewOnly,
  marks,
}: {
  ballot: UseBallotState
  max: number
  viewOnly: boolean
  marks: BaselineMarks
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
      <p className="mb-2 text-sm font-medium">
        Approve your top {ballot.state.approvalTopK} candidate
        {ballot.state.approvalTopK === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-3">
        <Stepper
          label="number to approve"
          value={ballot.state.approvalTopK}
          min={0}
          max={max}
          onChange={ballot.setApprovalTopK}
          disabled={viewOnly}
        />
        {marks.approvalTopK != null && (
          <GhostBadge
            value={marks.approvalTopK}
            srLabel={`was ${marks.approvalTopK}`}
          />
        )}
      </div>
    </div>
  )
}

function CutoffStepper({
  ballot,
  viewOnly,
  marks,
}: {
  ballot: UseBallotState
  viewOnly: boolean
  marks: BaselineMarks
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
      <p className="mb-2 text-sm font-medium">
        Approve candidates scoring {ballot.state.approvalCutoff} or higher
      </p>
      <div className="flex items-center gap-3">
        <Stepper
          label="approval score cutoff"
          value={ballot.state.approvalCutoff}
          min={0}
          max={5}
          onChange={ballot.setApprovalCutoff}
          disabled={viewOnly}
        />
        {marks.approvalCutoff != null && (
          <GhostBadge
            value={marks.approvalCutoff}
            srLabel={`was ${marks.approvalCutoff}`}
          />
        )}
      </div>
    </div>
  )
}

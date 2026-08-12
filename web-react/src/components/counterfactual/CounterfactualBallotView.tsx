import { CheckIcon } from 'lucide-react'

import { BallotChangeBanner } from '@/components/ballot/BallotChangeBanner'
import { ScoreChips } from '@/components/ballot/ScoreChips'
import { SortableList, SortableRow } from '@/components/ballot/SortableList'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { H3, Muted } from '@/components/ui/typography'
import { summarizeChange } from '@/lib/counterfactualFilter'
import type { Candidate } from '@/lib/elections'
import { cn, ordinal } from '@/lib/utils'
import type { Payload } from '@shared/derive'

interface CounterfactualBallotViewProps {
  voterName: string
  payload: Payload
  original: Payload
  algorithms: string[]
  includeFptp: boolean
  candidates: Candidate[]
  isEdited: boolean
  onChange: (payload: Payload) => void
  onRevert: () => void
}

/**
 * A payload-authoritative ballot editor for what-if overrides.
 *
 * Real voting deliberately derives some algorithm fields from others. A
 * counterfactual replacement is different: it is already a complete payload,
 * and a search may change one algorithm without changing the rest. Rendering
 * each payload field directly is what keeps the editor, ledger, and simulation
 * on the same exact scenario.
 */
export function CounterfactualBallotView({
  voterName,
  payload,
  original,
  algorithms,
  includeFptp,
  candidates,
  isEdited,
  onChange,
  onRevert,
}: CounterfactualBallotViewProps) {
  const candidateIds = candidates.map((candidate) => candidate.id)
  const nameOf = (id: string) =>
    candidates.find((candidate) => candidate.id === id)?.name ??
    'Removed candidate'
  const changeCount = summarizeChange(original, payload, nameOf).length

  return (
    <div className="hatch-hypothetical rounded-xl border border-dashed border-foreground/25 p-3">
      <BallotChangeBanner
        className="mb-2"
        restingLabel="Their ballot"
        changeCount={changeCount}
        changeSuffix="to their ballot"
        onUndo={onRevert}
        undoLabel="Undo changes"
        undoAvailable={isEdited}
      />

      <div className="space-y-3">
        {algorithms.includes('irv') && (
          <RankingCard
            ids={completeOrder(payload.irv, candidateIds)}
            originalIds={completeOrder(original.irv, candidateIds)}
            nameOf={nameOf}
            onChange={(irv) => onChange({ ...payload, irv })}
          />
        )}
        {algorithms.includes('star') && (
          <ScoreCard
            candidates={candidates}
            scores={payload.star ?? {}}
            originalScores={original.star ?? {}}
            onChange={(id, score) =>
              onChange({
                ...payload,
                star: { ...payload.star, [id]: score },
              })
            }
          />
        )}
        {algorithms.includes('approval') && (
          <ApprovalCard
            candidates={candidates}
            approved={payload.approval ?? []}
            originalApproved={original.approval ?? []}
            onChange={(approval) => onChange({ ...payload, approval })}
          />
        )}
        {includeFptp && (
          <FptpCard
            candidates={candidates}
            value={payload.fptp ?? null}
            originalValue={original.fptp ?? null}
            onChange={(fptp) => {
              const next = { ...payload }
              if (fptp == null) delete next.fptp
              else next.fptp = fptp
              onChange(next)
            }}
          />
        )}
      </div>

      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Changes here are hypothetical. {voterName}&apos;s real ballot is
        untouched.
      </p>
    </div>
  )
}

function completeOrder(order: string[] | undefined, candidateIds: string[]) {
  const current = new Set(candidateIds)
  const result = (order ?? []).filter((id) => current.has(id))
  for (const id of candidateIds) if (!result.includes(id)) result.push(id)
  return result
}

function RankingCard({
  ids,
  originalIds,
  nameOf,
  onChange,
}: {
  ids: string[]
  originalIds: string[]
  nameOf: (id: string) => string
  onChange: (ids: string[]) => void
}) {
  return (
    <Card>
      <CardContent>
        <H3 className="text-base">Rank the Candidates</H3>
        <Muted className="mt-1 mb-3">
          Drag candidates into the hypothetical IRV order.
        </Muted>
        <SortableList
          ids={ids}
          onReorder={(activeId, overId) => {
            const from = ids.indexOf(activeId)
            const to = ids.indexOf(overId)
            if (from < 0 || to < 0 || from === to) return
            const next = [...ids]
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            onChange(next)
          }}
        >
          {ids.map((id, index) => {
            const was = originalIds.indexOf(id)
            return (
              <SortableRow key={id} id={id}>
                <div className="flex items-center gap-3">
                  <PositionBadge index={index} />
                  {was >= 0 && was !== index && (
                    <span className="mark-baseline flex size-6 shrink-0 items-center justify-center rounded-full border-2 bg-background text-xs font-semibold text-muted-foreground tabular-nums">
                      <span aria-hidden>{was + 1}</span>
                      <span className="sr-only">was {ordinal(was + 1)}</span>
                    </span>
                  )}
                  <span className="font-medium">{nameOf(id)}</span>
                </div>
              </SortableRow>
            )
          })}
        </SortableList>
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

function ScoreCard({
  candidates,
  scores,
  originalScores,
  onChange,
}: {
  candidates: Candidate[]
  scores: Record<string, number>
  originalScores: Record<string, number>
  onChange: (id: string, score: number) => void
}) {
  return (
    <Card>
      <CardContent>
        <H3 className="text-base">Score the Candidates (STAR)</H3>
        <Muted className="mt-1 mb-3">
          Set each candidate&apos;s hypothetical STAR score.
        </Muted>
        <div className="flex flex-col gap-4">
          {candidates.map((candidate) => {
            const value = scores[candidate.id] ?? 0
            const originalValue = originalScores[candidate.id] ?? 0
            return (
              <div
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="font-medium">{candidate.name}</span>
                <ScoreChips
                  label={candidate.name}
                  value={value}
                  onChange={(score) => onChange(candidate.id, score)}
                  baselineValue={
                    value === originalValue ? undefined : originalValue
                  }
                />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function ApprovalCard({
  candidates,
  approved,
  originalApproved,
  onChange,
}: {
  candidates: Candidate[]
  approved: string[]
  originalApproved: string[]
  onChange: (ids: string[]) => void
}) {
  const current = new Set(approved)
  const baseline = new Set(originalApproved)
  return (
    <Card>
      <CardContent>
        <H3 className="text-base">Approve Candidates</H3>
        <Muted className="mt-1 mb-3">
          Set the hypothetical approval choices directly.
        </Muted>
        <div className="flex flex-col gap-1">
          {candidates.map((candidate) => {
            const checked = current.has(candidate.id)
            const wasChecked = baseline.has(candidate.id)
            const changed = checked !== wasChecked
            return (
              <Field
                key={candidate.id}
                orientation="horizontal"
                className="py-1"
              >
                <span className="relative flex items-center">
                  <Checkbox
                    id={`counterfactual-approve-${candidate.id}`}
                    checked={checked}
                    onCheckedChange={() =>
                      onChange(
                        checked
                          ? approved.filter((id) => id !== candidate.id)
                          : [...approved, candidate.id],
                      )
                    }
                    data-baseline={changed ? 'true' : undefined}
                    className={cn(changed && 'mark-baseline border-2')}
                  />
                  {changed && wasChecked && (
                    <CheckIcon
                      aria-hidden
                      className="pointer-events-none absolute inset-0 m-auto size-3 text-muted-foreground"
                    />
                  )}
                </span>
                <FieldLabel htmlFor={`counterfactual-approve-${candidate.id}`}>
                  {candidate.name}
                  {changed && (
                    <span className="sr-only">
                      {wasChecked ? '(was approved)' : '(was not approved)'}
                    </span>
                  )}
                </FieldLabel>
              </Field>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function FptpCard({
  candidates,
  value,
  originalValue,
  onChange,
}: {
  candidates: Candidate[]
  value: string | null
  originalValue: string | null
  onChange: (id: string | null) => void
}) {
  return (
    <Card>
      <CardContent>
        <H3 className="text-base">First Choice (FPTP)</H3>
        <Muted className="mt-1 mb-3">
          Set the hypothetical plurality pick.
        </Muted>
        <RadioGroup
          value={value ?? ''}
          onValueChange={(next) => onChange((next as string) || null)}
        >
          {candidates.map((candidate) => (
            <Field
              key={candidate.id}
              orientation="horizontal"
              data-baseline={
                candidate.id === originalValue && value !== originalValue
                  ? 'true'
                  : undefined
              }
              className={cn(
                candidate.id === originalValue &&
                  value !== originalValue &&
                  'mark-baseline -mx-2 rounded-lg border px-2 py-1',
              )}
            >
              <RadioGroupItem
                value={candidate.id}
                id={`counterfactual-fptp-${candidate.id}`}
              />
              <FieldLabel htmlFor={`counterfactual-fptp-${candidate.id}`}>
                {candidate.name}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  )
}

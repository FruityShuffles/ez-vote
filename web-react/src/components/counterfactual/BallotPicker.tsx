import { useMemo, useState } from 'react'
import { ChevronRight, Search, Undo2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Muted } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import type { Candidate } from '@/lib/elections'
import type { Payload } from '@shared/derive'
import {
  RELATION_LABELS,
  availableRelations,
  ballotSummary,
  changedCandidates,
  filterBallots,
  summarizeChange,
  voterName,
  type BallotRelation,
  type FilterableBallot,
} from '@/lib/counterfactualFilter'

import { BallotFingerprint } from './BallotFingerprint'

// Screen 1 of the what-if explorer: choose whose ballot to change (M21).
//
// Every row carries the ballot itself, not just a name — see `BallotFingerprint`
// for why. A row whose ballot has been changed carries its own diff and its own
// undo, so the record of an edit sits where the edit was made rather than only
// in a ledger at the foot of the page.
//
// The candidate filter offers only the relations the ballots can actually
// answer (see `availableRelations`) — an approval-only election has no first
// preference, and inventing one would misreport the voter.

/** A pending hypothetical, keyed by voter, as the picker needs to render it. */
export interface PendingEdit {
  original: Payload
  payload: Payload
}

interface BallotPickerProps {
  ballots: FilterableBallot[]
  candidates: Candidate[]
  edits: Record<string, PendingEdit>
  onSelect: (voterId: string) => void
  onUndo: (voterId: string) => void
}

export function BallotPicker({
  ballots,
  candidates,
  edits,
  onSelect,
  onUndo,
}: BallotPickerProps) {
  const [query, setQuery] = useState('')
  const [relation, setRelation] = useState<BallotRelation | null>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [changedOnly, setChangedOnly] = useState(false)

  const candidateIds = useMemo(() => candidates.map((c) => c.id), [candidates])
  const nameOf = useMemo(() => {
    const map = new Map(candidates.map((c) => [c.id, c.name]))
    return (id: string) => map.get(id) ?? 'Removed candidate'
  }, [candidates])

  const relations = useMemo(
    () => availableRelations(ballots.map((b) => b.payload)),
    [ballots],
  )
  const activeRelation = relation ?? relations[0] ?? null
  const editCount = Object.keys(edits).length

  // The fingerprint encodes three things at once, none of them self-evident.
  // Each clause is offered only when the ballots actually carry that dimension,
  // so an approval-only election isn't told about scores it doesn't have.
  const legend = useMemo(() => {
    const payloads = ballots.map((b) => b.payload)
    const parts: string[] = []
    if (payloads.some((p) => (p.irv?.length ?? 0) > 0 || p.star != null)) {
      parts.push("In each voter's own order")
    }
    if (payloads.some((p) => (p.approval?.length ?? 0) > 0)) {
      parts.push('filled = approved')
    }
    if (payloads.some((p) => p.star != null)) {
      parts.push('number = score')
    }
    if (editCount > 0) {
      parts.push('outlined = you changed it')
    }
    return parts
  }, [ballots, editCount])

  const visible = useMemo(() => {
    const matched = filterBallots(ballots, {
      query,
      relation: activeRelation ?? undefined,
      candidateId,
    })
    return changedOnly ? matched.filter((b) => b.voter_id in edits) : matched
  }, [ballots, query, activeRelation, candidateId, changedOnly, edits])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voters by name"
          aria-label="Search voters by name"
          className="h-9 pl-8"
        />
      </div>

      {relations.length > 0 && candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          {relations.length > 1 && (
            <div
              role="group"
              aria-label="Filter ballots by"
              className="flex flex-wrap gap-1.5"
            >
              {relations.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={activeRelation === r}
                  onClick={() => setRelation(r)}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                    activeRelation === r
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {RELATION_LABELS[r]}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              role="group"
              aria-label={`Filter by ${
                activeRelation
                  ? RELATION_LABELS[activeRelation].toLowerCase()
                  : 'candidate'
              }`}
              className="flex flex-wrap gap-1.5"
            >
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={candidateId === c.id}
                  onClick={() =>
                    setCandidateId((current) =>
                      current === c.id ? null : c.id,
                    )
                  }
                  className={cn(
                    'rounded-4xl border px-2.5 py-0.5 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                    candidateId === c.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-foreground hover:bg-muted',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {/* Only worth offering once there is something to isolate. A rule
                marks it as a different axis from the candidate chips. */}
            {editCount > 0 && (
              <>
                <span
                  aria-hidden
                  className="mx-0.5 h-4 border-l border-border"
                />
                <button
                  type="button"
                  aria-pressed={changedOnly}
                  onClick={() => setChangedOnly((v) => !v)}
                  className={cn(
                    'rounded-4xl border border-dashed px-2.5 py-0.5 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                    changedOnly
                      ? 'border-foreground/50 bg-secondary text-secondary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  Changed ({editCount})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <Muted>No ballots match this filter.</Muted>
      ) : (
        <>
          {legend.length > 0 && (
            <p className="-mb-2 text-[11px] text-muted-foreground">
              {legend.join(' · ')}
            </p>
          )}
          <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/10">
            {visible.map((ballot) => (
              <BallotRow
                key={ballot.voter_id}
                ballot={ballot}
                edit={edits[ballot.voter_id]}
                candidateIds={candidateIds}
                nameOf={nameOf}
                onSelect={onSelect}
                onUndo={onUndo}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function BallotRow({
  ballot,
  edit,
  candidateIds,
  nameOf,
  onSelect,
  onUndo,
}: {
  ballot: FilterableBallot
  edit?: PendingEdit
  candidateIds: string[]
  nameOf: (id: string) => string
  onSelect: (voterId: string) => void
  onUndo: (voterId: string) => void
}) {
  const name = voterName(ballot)
  const phrases = edit
    ? summarizeChange(edit.original, edit.payload, nameOf)
    : []

  return (
    // The name button is stretched over the whole row via `after:inset-0`, so
    // the row is one big target while the undo control stays a separate button —
    // nesting one button inside another would be invalid and unreachable by
    // keyboard.
    <li
      className={cn(
        'relative flex flex-col gap-1.5 px-3 py-2.5 transition-colors motion-reduce:transition-none first:rounded-t-lg last:rounded-b-lg hover:bg-muted',
        edit && 'bg-muted/40',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(ballot.voter_id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {name}
        </button>
        {edit && (
          <button
            type="button"
            onClick={() => onUndo(ballot.voter_id)}
            aria-label={`Undo the change to ${name}'s ballot`}
            className="relative z-10 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors motion-reduce:transition-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Undo2 className="size-3" aria-hidden />
            Undo
          </button>
        )}
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </div>

      {edit ? (
        <>
          <BallotFingerprint
            entries={ballotSummary(edit.original, candidateIds)}
            nameOf={nameOf}
            tone="was"
            label={`${name}'s real ballot`}
          />
          <BallotFingerprint
            entries={ballotSummary(edit.payload, candidateIds)}
            nameOf={nameOf}
            tone="now"
            changedIds={changedCandidates(
              edit.original,
              edit.payload,
              candidateIds,
            )}
            // The two strips make the change obvious on sight, so no sentence
            // repeats them — but the outline marking those chips is purely
            // visual, so the description moves here rather than disappearing.
            label={
              phrases.length > 0
                ? `Changed to: ${phrases.join('; ')}`
                : 'Changed ballot'
            }
          />
        </>
      ) : (
        <BallotFingerprint
          entries={ballotSummary(ballot.payload, candidateIds)}
          nameOf={nameOf}
        />
      )}
    </li>
  )
}

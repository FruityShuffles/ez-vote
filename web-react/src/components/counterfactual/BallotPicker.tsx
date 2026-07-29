import { useMemo, useState } from 'react'
import { ChevronRight, PencilLine, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Muted } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import type { Candidate } from '@/lib/elections'
import {
  RELATION_LABELS,
  availableRelations,
  filterBallots,
  topChoiceOf,
  voterName,
  type BallotRelation,
  type FilterableBallot,
} from '@/lib/counterfactualFilter'

// Screen 1 of the what-if explorer: choose whose ballot to change (M21).
//
// The candidate filter offers only the relations the ballots can actually
// answer (see `availableRelations`) — an approval-only election has no first
// preference, and inventing one would misreport the voter.

interface BallotPickerProps {
  ballots: FilterableBallot[]
  candidates: Candidate[]
  /** Voters with a pending hypothetical change, so the list can mark them. */
  editedVoterIds: Set<string>
  onSelect: (voterId: string) => void
}

export function BallotPicker({
  ballots,
  candidates,
  editedVoterIds,
  onSelect,
}: BallotPickerProps) {
  const [query, setQuery] = useState('')
  const [relation, setRelation] = useState<BallotRelation | null>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)

  const nameOf = useMemo(() => {
    const map = new Map(candidates.map((c) => [c.id, c.name]))
    return (id: string) => map.get(id) ?? 'Removed candidate'
  }, [candidates])

  const relations = useMemo(
    () => availableRelations(ballots.map((b) => b.payload)),
    [ballots],
  )
  const activeRelation = relation ?? relations[0] ?? null

  const visible = useMemo(
    () =>
      filterBallots(ballots, {
        query,
        relation: activeRelation ?? undefined,
        candidateId,
      }),
    [ballots, query, activeRelation, candidateId],
  )

  function toggleCandidate(id: string) {
    setCandidateId((current) => (current === id ? null : id))
  }

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
                    'rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
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
          <div
            role="group"
            aria-label={`Filter by ${
              activeRelation ? RELATION_LABELS[activeRelation].toLowerCase() : 'candidate'
            }`}
            className="flex flex-wrap gap-1.5"
          >
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={candidateId === c.id}
                onClick={() => toggleCandidate(c.id)}
                className={cn(
                  'rounded-4xl border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  candidateId === c.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-foreground hover:bg-muted',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <Muted>No ballots match this filter.</Muted>
      ) : (
        <ul className="divide-y divide-border rounded-lg ring-1 ring-foreground/10">
          {visible.map((ballot) => {
            const top = topChoiceOf(ballot.payload)
            const edited = editedVoterIds.has(ballot.voter_id)
            return (
              <li key={ballot.voter_id}>
                <button
                  type="button"
                  onClick={() => onSelect(ballot.voter_id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {voterName(ballot)}
                  </span>
                  {edited && (
                    <Badge variant="secondary" className="gap-1">
                      <PencilLine className="size-3" aria-hidden />
                      Changed
                    </Badge>
                  )}
                  {top != null && (
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {nameOf(top)}
                    </span>
                  )}
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

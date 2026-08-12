import { useParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  CircleCheck,
  ListOrdered,
  Star,
  TriangleAlert,
  User,
  Vote,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Stack } from '@/components/ui/layout'
import { H1, H2, Muted } from '@/components/ui/typography'
import { ResultsView } from '@/components/results/ResultsView'
import { StatusBadge } from '@/components/elections/StatusBadge'
import { BallotCountRow } from '@/components/elections/BallotCountRow'
import { PendingInviteesRow } from '@/components/elections/PendingInviteesRow'
import { AddCandidateField } from '@/components/elections/AddCandidateField'
import { InviteVotersDialog } from '@/components/elections/InviteVotersDialog'
import { useWorkspaceElection } from '@/lib/electionWorkspace'
import { useAuth } from '@/auth/context'
import {
  useCandidates,
  useCloseElection,
  useElectionParticipation,
  useExistingBallot,
  useOpenElection,
} from '@/lib/elections'
import type { Ballot, Candidate, Election } from '@/lib/elections'
import { useElectionRealtime } from '@/lib/useElectionRealtime'
import { friendlyError } from '@/lib/errors'

// Election detail surface (M9), ported from Flutter `ElectionDetailScreen`.
// Acceptance criteria: parity checklist §3 (DET-01…DET-07).
//
// Container/view split mirrors `ResultsView`/`ResultsList`: the container does
// the fetching, the view takes resolved data so the role/transition/stale logic
// is unit-testable without Supabase. Realtime auto-refresh (the Flutter 10s
// poll) lives in the container via `useElectionRealtime` (M15, parity §9), which
// keeps the view pure.

/** Route entry: resolves `:id`, fetches the election, owns loading/error. */
export function ElectionDetail() {
  const { id } = useParams<{ id: string }>()
  const electionId = id ?? ''

  const election = useWorkspaceElection()
  const candidatesQuery = useCandidates(electionId)
  const ballotQuery = useExistingBallot(electionId)
  const { user } = useAuth()
  const isOwner = election.owner_id === user?.id
  const participationQuery = useElectionParticipation(
    electionId,
    user?.id ?? null,
    { enabled: !isOwner },
  )

  // Live auto-refresh while the election is open (results, voters, invitees,
  // ad-hoc candidates). No-ops for closed/draft elections and those without a
  // live-updating surface.
  useElectionRealtime(election)

  return (
    <ElectionDetailView
      election={election}
      candidates={candidatesQuery.data ?? []}
      candidatesLoading={candidatesQuery.isPending}
      candidatesError={candidatesQuery.isError}
      ballot={ballotQuery.data ?? null}
      currentUserId={user?.id ?? null}
      isParticipant={
        isOwner || ballotQuery.data != null || participationQuery.data === true
      }
    />
  )
}

interface ElectionDetailViewProps {
  election: Election
  candidates: Candidate[]
  candidatesLoading: boolean
  candidatesError: boolean
  ballot: Ballot | null
  /** Read live from `useAuth()` so ownership recomputes on auth change (DET-02). */
  currentUserId: string | null
  /** Joined membership is separate from ballot status for non-voters. */
  isParticipant: boolean
}

export function ElectionDetailView({
  election,
  candidates,
  candidatesLoading,
  candidatesError,
  ballot,
  currentUserId,
  isParticipant,
}: ElectionDetailViewProps) {
  const navigate = useNavigate()
  const isOwner = election.owner_id === currentUserId
  const isClosed = election.status === 'closed'
  const hasSubmittedBallot = ballot != null
  const canAccessParticipantSurfaces = isOwner || isParticipant

  // Results show when the election is closed, or live for a voter who has
  // submitted in a realtime-results election (auto-refreshed by the container's
  // useElectionRealtime poll — M15).
  const showResults =
    isClosed ||
    (election.realtime_results &&
      election.status === 'open' &&
      hasSubmittedBallot)

  return (
    <Stack gap={4}>
      <div>
        <H1>{election.title}</H1>
        {election.description && (
          <Muted className="mt-1">{election.description}</Muted>
        )}
      </div>

      <div>
        <StatusBadge status={election.status} />
      </div>

      <Stack gap={1}>
        <BallotCountRow
          electionId={election.id}
          publicBallots={election.public_ballots}
          canViewVoterDetails={canAccessParticipantSurfaces}
        />
        {canAccessParticipantSurfaces && (
          <PendingInviteesRow electionId={election.id} />
        )}
      </Stack>

      <AlgorithmChips algorithms={election.algorithms} />

      {/* Results render above the candidate list on the detail surface (RES-06). */}
      {showResults && (
        <>
          <Separator className="my-2" />
          <H2 className="text-xl">
            {election.status === 'open' ? 'Live Results' : 'Results'}
          </H2>
          <ResultsView
            electionId={election.id}
            winnerAction={
              isClosed && election.public_ballots ? (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/election/${election.id}/explore`)}
                >
                  Explore what-ifs
                </Button>
              ) : undefined
            }
          />
          {isClosed && !election.public_ballots && isOwner && (
            <Muted>
              What-if exploration is unavailable because ballots were not made
              public when this election was created.
            </Muted>
          )}
        </>
      )}

      {!isClosed && (
        <CandidateSection
          election={election}
          candidates={candidates}
          loading={candidatesLoading}
          error={candidatesError}
          canParticipate={canAccessParticipantSurfaces}
        />
      )}

      {isOwner && <OwnerControls election={election} />}

      {canAccessParticipantSurfaces &&
        (election.status === 'open' || isClosed) && (
          <VoterControls election={election} ballot={ballot} />
        )}
    </Stack>
  )
}

const ALGORITHM_META: Record<
  string,
  { label: string; Icon: typeof CheckCircle2 }
> = {
  approval: { label: 'Approval', Icon: CheckCircle2 },
  irv: { label: 'IRV', Icon: ListOrdered },
  star: { label: 'STAR', Icon: Star },
  fptp: { label: 'FPTP', Icon: User },
}

function AlgorithmChips({ algorithms }: { algorithms: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {algorithms.map((algo) => {
        const meta = ALGORITHM_META[algo] ?? { label: algo, Icon: Vote }
        const { label, Icon } = meta
        return (
          <Badge key={algo} variant="secondary" className="gap-1">
            <Icon className="size-3" aria-hidden />
            {label}
          </Badge>
        )
      })}
    </div>
  )
}

function CandidateSection({
  election,
  candidates,
  loading,
  error,
  canParticipate,
}: {
  election: Election
  candidates: Candidate[]
  loading: boolean
  error: boolean
  canParticipate: boolean
}) {
  if (loading) {
    return <Spinner className="size-5 text-muted-foreground" />
  }
  if (error) {
    return (
      <Muted role="alert">Could not load candidates. Please try again.</Muted>
    )
  }
  const canAdd =
    canParticipate &&
    election.allow_voter_candidates &&
    election.status === 'open'

  return (
    <div>
      <H2 className="text-base">Candidates ({candidates.length})</H2>
      <div className="mt-2 flex flex-wrap gap-2">
        {candidates.map((c) => (
          // Entry order preserved — list is sorted by `position` (DET-01).
          <Badge key={c.id} variant="outline">
            {c.name}
          </Badge>
        ))}
      </div>
      {canAdd && <AddCandidateField electionId={election.id} />}
    </div>
  )
}

function OwnerControls({ election }: { election: Election }) {
  const navigate = useNavigate()
  const openElection = useOpenElection(election.id)
  const closeElection = useCloseElection(election.id)

  // No owner actions once closed — hide the whole card (matches Flutter).
  if (election.status === 'closed') return null

  async function open() {
    try {
      await openElection.mutateAsync()
    } catch (e) {
      toast.error(friendlyError(e, 'Error opening election. Please try again.'))
    }
  }

  async function close() {
    try {
      await closeElection.mutateAsync()
    } catch (e) {
      toast.error(
        friendlyError(e, 'Error computing results. Please try again.'),
      )
    }
  }

  return (
    <Card>
      <CardContent>
        <Muted className="mb-3 text-xs">Owner Controls</Muted>
        <div className="flex flex-wrap gap-3">
          {election.status === 'draft' && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  navigate(`/election/${election.id}/edit`, {
                    state: { from: 'election-detail' },
                  })
                }
              >
                Edit Election
              </Button>
              <Button
                disabled={openElection.isPending}
                onClick={() => void open()}
              >
                {openElection.isPending ? 'Opening…' : 'Open Election'}
              </Button>
            </>
          )}
          {election.status === 'open' && (
            <>
              <InviteVotersDialog electionId={election.id} />
              <Button
                variant="destructive"
                disabled={closeElection.isPending}
                onClick={() => void close()}
              >
                {closeElection.isPending
                  ? 'Closing…'
                  : election.realtime_results
                    ? 'Close Election'
                    : 'Close & Compute Results'}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function VoterControls({
  election,
  ballot,
}: {
  election: Election
  ballot: Ballot | null
}) {
  const navigate = useNavigate()
  const isClosed = election.status === 'closed'

  if (ballot != null) {
    // Stale check compares server timestamps (DET-06): the warning appears when
    // candidates changed after the ballot was last saved, and clears once the
    // voter re-votes (which bumps `ballot.updated_at`). Never shown when closed.
    const isStale =
      new Date(election.candidates_updated_at).getTime() >
      new Date(ballot.updated_at).getTime()

    return (
      <Card>
        <CardContent>
          <Stack gap={3} className="items-start">
            {isStale && !isClosed && (
              <div
                role="alert"
                className="flex w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
              >
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                Candidates have changed since your last vote — update your
                ballot.
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <CircleCheck className="size-4 text-green-600" aria-hidden />
              You have already submitted your ballot.
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(`/election/${election.id}/vote`)}
            >
              {isClosed ? 'View Ballot' : 'Edit Ballot'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  // No ballot yet: closed elections show nothing; open ones invite a vote.
  if (isClosed) return null

  return (
    <Card>
      <CardContent>
        <Button onClick={() => navigate(`/election/${election.id}/vote`)}>
          <Vote /> Cast Your Vote
        </Button>
      </CardContent>
    </Card>
  )
}

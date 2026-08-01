import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { BallotView } from '@/components/ballot/BallotView'
import { useWorkspaceElection } from '@/lib/electionWorkspace'
import { Button } from '@/components/ui/button'
import { CenteredState } from '@/components/ui/centered-state'
import { Stack } from '@/components/ui/layout'
import { Spinner } from '@/components/ui/spinner'
import { H1, Muted } from '@/components/ui/typography'
import {
  useCandidates,
  usePublicBallots,
  type Candidate,
} from '@/lib/elections'
import { useBallotState } from '@/lib/useBallotState'
import type { Payload } from '@shared/derive'

// Read-only route for an opted-in participant ballot (PUB-01). It never reads
// the ballots table directly; the query is protected by get_public_ballots.
export function PublicBallot() {
  const { id, index: indexParam } = useParams<{ id: string; index: string }>()
  const electionId = id ?? ''
  const index = Number(indexParam)
  const election = useWorkspaceElection()
  const candidatesQuery = useCandidates(electionId)
  const ballotsQuery = usePublicBallots(electionId)
  const navigate = useNavigate()

  if (
    candidatesQuery.isPending || ballotsQuery.isPending
  ) {
    return (
      <CenteredState>
        <Spinner className="size-6 text-muted-foreground" />
      </CenteredState>
    )
  }
  if (
    candidatesQuery.isError ||
    ballotsQuery.isError ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= (ballotsQuery.data?.length ?? 0)
  ) {
    return (
      <CenteredState>
        <Muted role="alert">Could not load this public ballot.</Muted>
      </CenteredState>
    )
  }

  const ballots = ballotsQuery.data
  return (
    <PublicBallotView
      index={index}
      total={ballots.length}
      voterName={ballots[index].display_name || 'Unnamed voter'}
      payload={ballots[index].payload as Payload}
      algorithms={election.algorithms}
      includeFptp={election.include_fptp}
      candidates={candidatesQuery.data ?? []}
      onPrevious={() =>
        navigate(`/election/${electionId}/ballot/${index - 1}`, {
          replace: true,
          state: { from: 'voters' },
        })
      }
      onNext={() =>
        navigate(`/election/${electionId}/ballot/${index + 1}`, {
          replace: true,
          state: { from: 'voters' },
        })
      }
    />
  )
}

function PublicBallotView({
  index,
  total,
  voterName,
  payload,
  algorithms,
  includeFptp,
  candidates,
  onPrevious,
  onNext,
}: {
  index: number
  total: number
  voterName: string
  payload: Payload
  algorithms: string[]
  includeFptp: boolean
  candidates: Candidate[]
  onPrevious: () => void
  onNext: () => void
}) {
  const ballot = useBallotState({
    candidates,
    algorithms,
    includeFptp,
    existingPayload: payload,
  })

  return (
    <Stack gap={4}>
        <div>
          <H1>{voterName}'s ballot</H1>
          <Muted className="mt-1">
            {index + 1} of {total}
          </Muted>
        </div>

        <BallotView
          ballot={ballot}
          candidates={candidates}
          includeFptp={includeFptp}
          viewOnly
          zeroApprovalFlash={false}
        />

        <div className="flex justify-between gap-3">
          <Button variant="outline" disabled={index === 0} onClick={onPrevious}>
            <ChevronLeft /> Previous
          </Button>
          <Button
            variant="outline"
            disabled={index === total - 1}
            onClick={onNext}
          >
            Next <ChevronRight />
          </Button>
        </div>
    </Stack>
  )
}

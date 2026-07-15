import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { AppShell } from '@/components/ui/app-shell'
import { BallotView } from '@/components/ballot/BallotView'
import { Button } from '@/components/ui/button'
import { Stack } from '@/components/ui/layout'
import { Spinner } from '@/components/ui/spinner'
import { H1, Muted } from '@/components/ui/typography'
import {
  useCandidates,
  useElection,
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
  const electionQuery = useElection(electionId)
  const candidatesQuery = useCandidates(electionId)
  const ballotsQuery = usePublicBallots(electionId)
  const navigate = useNavigate()

  if (
    electionQuery.isPending ||
    candidatesQuery.isPending ||
    ballotsQuery.isPending
  ) {
    return (
      <AppShell width="sm">
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      </AppShell>
    )
  }
  if (
    electionQuery.isError ||
    candidatesQuery.isError ||
    ballotsQuery.isError ||
    !electionQuery.data ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= (ballotsQuery.data?.length ?? 0)
  ) {
    return (
      <AppShell width="sm">
        <Muted role="alert">Could not load this public ballot.</Muted>
      </AppShell>
    )
  }

  const ballots = ballotsQuery.data
  return (
    <PublicBallotView
      index={index}
      total={ballots.length}
      voterName={ballots[index].display_name || 'Unnamed voter'}
      payload={ballots[index].payload as Payload}
      algorithms={electionQuery.data.algorithms}
      includeFptp={electionQuery.data.include_fptp}
      candidates={candidatesQuery.data ?? []}
      onPrevious={() =>
        navigate(`/election/${electionId}/ballot/${index - 1}`, { replace: true })
      }
      onNext={() =>
        navigate(`/election/${electionId}/ballot/${index + 1}`, { replace: true })
      }
      onBack={() => navigate(`/election/${electionId}`)}
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
  onBack,
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
  onBack: () => void
}) {
  const ballot = useBallotState({
    candidates,
    algorithms,
    includeFptp,
    existingPayload: payload,
  })

  return (
    <AppShell width="sm">
      <Stack gap={4}>
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onBack}>
            <ChevronLeft /> Back to voters
          </Button>
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
    </AppShell>
  )
}

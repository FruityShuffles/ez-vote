import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

import { AppShell } from '@/components/ui/app-shell'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Stack } from '@/components/ui/layout'
import { H1, Muted } from '@/components/ui/typography'
import { BallotView } from '@/components/ballot/BallotView'
import {
  electionKeys,
  useCandidates,
  useElection,
  useExistingBallot,
  type Ballot as BallotRow,
  type Candidate,
  type Election,
} from '@/lib/elections'
import {
  fetchCandidates,
  payloadsEqual,
  triggerRealtimeCompute,
  useCandidateCount,
  useUpsertBallot,
} from '@/lib/ballot'
import { useBallotState } from '@/lib/useBallotState'
import { friendlyError } from '@/lib/errors'
import type { Payload } from '@shared/derive'

// Ballot / voting flow (M10), ported from Flutter `BallotScreen`. The route
// `/election/:id/vote` is reached from the detail surface (Cast Your Vote / Edit
// Ballot / — when closed — View Ballot). Container/view split mirrors
// ElectionDetail: this resolves the route and owns loading/error, the inner
// `BallotForm` runs once data is present so the ballot-state hook initialises
// from a known candidate list + existing ballot.

const APPROVAL_TEMPLATES = ['C', 'D', 'E', 'G']

export function Ballot() {
  const { id } = useParams<{ id: string }>()
  const electionId = id ?? ''

  const electionQuery = useElection(electionId)
  const candidatesQuery = useCandidates(electionId)
  const ballotQuery = useExistingBallot(electionId)

  const loading =
    electionQuery.isPending ||
    candidatesQuery.isPending ||
    ballotQuery.isPending
  const errored =
    electionQuery.isError || candidatesQuery.isError || ballotQuery.isError

  return (
    <AppShell width="sm">
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : errored || !electionQuery.data ? (
        <Muted role="alert">Could not load this ballot. Please try again.</Muted>
      ) : (
        <BallotForm
          election={electionQuery.data}
          candidates={candidatesQuery.data ?? []}
          existingBallot={ballotQuery.data ?? null}
        />
      )}
    </AppShell>
  )
}

function BallotForm({
  election,
  candidates,
  existingBallot,
}: {
  election: Election
  candidates: Candidate[]
  existingBallot: BallotRow | null
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const upsert = useUpsertBallot(election.id)

  const viewOnly = election.status === 'closed'

  const ballot = useBallotState({
    candidates,
    algorithms: election.algorithms,
    includeFptp: election.include_fptp,
    existingPayload: (existingBallot?.payload as Payload | null) ?? null,
  })

  const [zeroApprovalFlash, setZeroApprovalFlash] = useState(false)
  // Soft zero-approval warning fires once per ballot session (BAL-12).
  const zeroWarnedRef = useRef(false)

  // Ad-hoc candidate polling (BAL-10): while an open election accepts
  // voter-suggested candidates, poll the count and merge any change into the
  // in-progress ballot without discarding work. (Realtime is M15.)
  const adHoc =
    election.allow_voter_candidates && election.status === 'open' && !viewOnly
  const countQuery = useCandidateCount(election.id, { enabled: adHoc })
  const polledCount = countQuery.data

  useEffect(() => {
    if (!adHoc || polledCount == null || polledCount === candidates.length) return
    let cancelled = false
    void fetchCandidates(election.id).then((fresh) => {
      if (cancelled) return
      ballot.merge(fresh.map((c) => c.id))
      qc.setQueryData(electionKeys.candidates(election.id), fresh)
      toast('Candidates have been updated — your ballot has been adjusted')
    })
    return () => {
      cancelled = true
    }
    // Re-run only when the polled count diverges from the rendered list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledCount, candidates.length, adHoc, election.id])

  const title = viewOnly
    ? 'View Ballot'
    : existingBallot != null
      ? 'Edit Ballot'
      : 'Cast Your Vote'

  async function onSubmit() {
    // 1. Zero-approval soft warning: flash once, then allow on the next press.
    if (
      APPROVAL_TEMPLATES.includes(ballot.template) &&
      ballot.hasZeroApprovals() &&
      !zeroWarnedRef.current
    ) {
      zeroWarnedRef.current = true
      setZeroApprovalFlash(true)
      setTimeout(() => setZeroApprovalFlash(false), 2000)
      return
    }

    // 2. Hard validation.
    if (ballot.blockingErrors.length > 0) {
      toast.error(ballot.blockingErrors[0])
      return
    }

    // 3. Pre-submit candidate gate (BAL-11): if candidates changed since the
    // ballot was built, merge + warn and do NOT submit — the voter reviews first.
    if (election.allow_voter_candidates) {
      const fresh = await fetchCandidates(election.id)
      const freshIds = new Set(fresh.map((c) => c.id))
      const current = candidates.map((c) => c.id)
      const changed =
        fresh.length !== current.length || current.some((cid) => !freshIds.has(cid))
      if (changed) {
        ballot.merge(fresh.map((c) => c.id))
        qc.setQueryData(electionKeys.candidates(election.id), fresh)
        toast('New candidates were added — please review your ballot before submitting')
        return
      }
    }

    // 4. Persist, then optionally recompute realtime results (skipped when the
    // payload is unchanged — BAL-13).
    const payload = ballot.getPayload()
    const changed = !payloadsEqual(payload, existingBallot?.payload ?? null)
    try {
      await upsert.mutateAsync(payload)
      if (election.realtime_results && changed) {
        void triggerRealtimeCompute(election.id)
      }
      toast.success('Your ballot has been submitted')
      navigate(`/election/${election.id}`)
    } catch (e) {
      toast.error(
        friendlyError(e, 'Error submitting your ballot. Please try again.'),
      )
    }
  }

  return (
    <Stack gap={4}>
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-1 w-fit"
          onClick={() => navigate(`/election/${election.id}`)}
        >
          <ArrowLeft /> Back
        </Button>
        <H1>{title}</H1>
        <Muted className="mt-1">{election.title}</Muted>
      </div>

      <BallotView
        ballot={ballot}
        candidates={candidates}
        includeFptp={election.include_fptp}
        viewOnly={viewOnly}
        zeroApprovalFlash={zeroApprovalFlash}
      />

      {!viewOnly && (
        <Button
          className="w-full"
          disabled={upsert.isPending}
          onClick={() => void onSubmit()}
        >
          {upsert.isPending ? 'Submitting…' : 'Submit Ballot'}
        </Button>
      )}
    </Stack>
  )
}

import { useCallback, useEffect, useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { BallotPicker } from '@/components/counterfactual/BallotPicker'
import {
  ConsequenceRail,
  ConsequenceSummaryBar,
} from '@/components/counterfactual/ConsequenceRail'
import {
  EditLedger,
  type LedgerEntry,
} from '@/components/counterfactual/EditLedger'
import { HypotheticalBallot } from '@/components/counterfactual/HypotheticalBallot'
import { AppShell } from '@/components/ui/app-shell'
import { Button } from '@/components/ui/button'
import { Stack } from '@/components/ui/layout'
import { Spinner } from '@/components/ui/spinner'
import { H1, Muted } from '@/components/ui/typography'
import { payloadsEqual } from '@/lib/ballot'
import { type BallotOverride, useSimulate } from '@/lib/counterfactual'
import {
  summarizeChange,
  voterName,
  type FilterableBallot,
} from '@/lib/counterfactualFilter'
import { useCounterfactualStore } from '@/lib/counterfactualStore'
import {
  buildSubmitPayload,
  getTemplate,
  initialBallotState,
} from '@/lib/ballotState'
import {
  useCandidates,
  useElection,
  usePublicBallots,
  type Candidate,
  type Election,
  type PublicBallot,
} from '@/lib/elections'
import { useBallotState } from '@/lib/useBallotState'
import type { Payload } from '@shared/derive'

interface EditableBallot extends FilterableBallot {
  voter_id: string
}

interface ExplorerData {
  election: Election
  candidates: Candidate[]
  ballots: EditableBallot[]
}

const EMPTY_EDITS: Record<string, Payload> = {}

function canonicalPayload(
  payload: Payload,
  election: Election,
  candidates: Candidate[],
): Payload {
  const candidateIds = candidates.map((candidate) => candidate.id)
  return buildSubmitPayload(
    initialBallotState(candidateIds, election.algorithms, payload),
    getTemplate(election.algorithms),
    candidateIds,
    election.include_fptp,
  )
}

function useExplorerData(electionId: string) {
  const electionQuery = useElection(electionId)
  const candidatesQuery = useCandidates(electionId)
  const eligible =
    electionQuery.data?.status === 'closed' && electionQuery.data.public_ballots
  const ballotsQuery = usePublicBallots(electionId, { enabled: eligible })

  const loading =
    electionQuery.isPending ||
    candidatesQuery.isPending ||
    (eligible && ballotsQuery.isPending)
  const error =
    electionQuery.isError || candidatesQuery.isError || ballotsQuery.isError

  const data =
    !loading && !error && electionQuery.data && eligible
      ? {
          election: electionQuery.data,
          candidates: candidatesQuery.data ?? [],
          // A deleted account leaves voter_id null. It still counts in the
          // simulation, but the endpoint deliberately provides no stable handle
          // with which to override it.
          ballots: ((ballotsQuery.data ?? []) as PublicBallot[])
            .filter(
              (ballot): ballot is PublicBallot & { voter_id: string } =>
                typeof ballot.voter_id === 'string',
            )
            .map((ballot) => ({
              ...ballot,
              payload: ballot.payload as Payload,
            })),
        }
      : null

  return {
    data,
    loading,
    error,
    ineligible:
      electionQuery.data != null &&
      (electionQuery.data.status !== 'closed' ||
        !electionQuery.data.public_ballots),
  }
}

function useLedger(electionId: string, data: ExplorerData | null) {
  const storedElectionId = useCounterfactualStore((state) => state.electionId)
  const storedEdits = useCounterfactualStore((state) => state.edits)
  const selectElection = useCounterfactualStore((state) => state.selectElection)
  const recordEdit = useCounterfactualStore((state) => state.recordEdit)
  const removeEdit = useCounterfactualStore((state) => state.removeEdit)
  const reset = useCounterfactualStore((state) => state.reset)

  useEffect(() => selectElection(electionId), [electionId, selectElection])

  const edits = storedElectionId === electionId ? storedEdits : EMPTY_EDITS
  const originals = useMemo(
    () =>
      new Map(
        (data?.ballots ?? []).map((ballot) => [
          ballot.voter_id,
          canonicalPayload(ballot.payload, data!.election, data!.candidates),
        ]),
      ),
    [data],
  )
  const overrides = useMemo<BallotOverride[]>(
    () =>
      Object.entries(edits).map(([voterId, payload]) => ({
        op: 'replace',
        voter_id: voterId,
        payload,
      })),
    [edits],
  )
  const nameOf = useMemo(() => {
    const names = new Map(
      (data?.candidates ?? []).map((candidate) => [
        candidate.id,
        candidate.name,
      ]),
    )
    return (candidateId: string) =>
      names.get(candidateId) ?? 'Removed candidate'
  }, [data?.candidates])
  const entries = useMemo<LedgerEntry[]>(
    () =>
      Object.entries(edits).map(([voterId, payload]) => ({
        voterId,
        voterName: voterName(
          data?.ballots.find((ballot) => ballot.voter_id === voterId) ?? {
            display_name: null,
          },
        ),
        phrases: summarizeChange(originals.get(voterId) ?? {}, payload, nameOf),
        op: 'replace',
      })),
    [data?.ballots, edits, nameOf, originals],
  )

  return {
    edits,
    originals,
    overrides,
    entries,
    recordEdit,
    removeEdit,
    reset,
  }
}

function ExplorerUnavailable({
  loading,
  ineligible,
}: {
  loading: boolean
  ineligible: boolean
}) {
  return (
    <AppShell width="lg">
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : (
        <Muted role="alert">
          {ineligible
            ? 'What-if exploration is available only for closed elections with public ballots.'
            : 'Could not load the what-if explorer. Please try again.'}
        </Muted>
      )}
    </AppShell>
  )
}

export function CounterfactualPicker() {
  const { id } = useParams<{ id: string }>()
  const electionId = id ?? ''
  const navigate = useNavigate()
  const explorer = useExplorerData(electionId)
  const ledger = useLedger(electionId, explorer.data)
  const simulation = useSimulate(
    electionId,
    ledger.overrides,
    explorer.data != null,
  )

  if (explorer.data == null) {
    return (
      <ExplorerUnavailable
        loading={explorer.loading}
        ineligible={explorer.ineligible}
      />
    )
  }
  if (simulation.isPending || simulation.data == null) {
    if (simulation.isError) {
      return (
        <AppShell width="lg">
          <Muted role="alert">{simulation.error.message}</Muted>
        </AppShell>
      )
    }
    return <ExplorerUnavailable loading ineligible={false} />
  }

  const edits = Object.fromEntries(
    Object.entries(ledger.edits).map(([voterId, payload]) => [
      voterId,
      { original: ledger.originals.get(voterId) ?? {}, payload },
    ]),
  )
  const hasEdits = ledger.entries.length > 0

  return (
    <AppShell width="lg">
      <Stack gap={4}>
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            onClick={() => navigate(`/election/${electionId}`)}
          >
            <ArrowLeft aria-hidden /> Back to results
          </Button>
          <H1>Explore what-ifs</H1>
          <Muted className="mt-1">
            Change a ballot hypothetically and compare how each method reacts.
          </Muted>
        </div>

        {simulation.isError && (
          <Muted role="alert">{simulation.error.message}</Muted>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <BallotPicker
            ballots={explorer.data.ballots}
            candidates={explorer.data.candidates}
            edits={edits}
            onSelect={(voterId) =>
              navigate(`/election/${electionId}/explore/${voterId}`)
            }
            onUndo={ledger.removeEdit}
          />
          <ConsequenceRail
            baseline={simulation.data.baseline}
            simulated={simulation.data.simulated}
            changed={simulation.data.changed}
            hasEdits={hasEdits}
            pending={simulation.isFetching}
            variant="compact"
            id="consequence-rail"
            className="lg:sticky lg:top-4"
          />
        </div>

        <EditLedger
          entries={ledger.entries}
          onRemove={ledger.removeEdit}
          onReset={ledger.reset}
          onSelect={(voterId) =>
            navigate(`/election/${electionId}/explore/${voterId}`)
          }
          variant="summary"
        />
        <ConsequenceSummaryBar
          baseline={simulation.data.baseline}
          simulated={simulation.data.simulated}
          changed={simulation.data.changed}
          hasEdits={hasEdits}
          targetId="consequence-rail"
          className="lg:hidden"
        />
      </Stack>
    </AppShell>
  )
}

export function CounterfactualEditor() {
  const { id, voterId = '' } = useParams<{
    id: string
    voterId: string
  }>()
  const electionId = id ?? ''
  const navigate = useNavigate()
  const explorer = useExplorerData(electionId)
  const ledger = useLedger(electionId, explorer.data)
  const simulation = useSimulate(
    electionId,
    ledger.overrides,
    explorer.data != null,
  )

  if (explorer.data == null) {
    return (
      <ExplorerUnavailable
        loading={explorer.loading}
        ineligible={explorer.ineligible}
      />
    )
  }
  const selected =
    explorer.data.ballots.find((ballot) => ballot.voter_id === voterId) ?? null
  if (selected == null) {
    return (
      <AppShell width="lg">
        <Muted role="alert">Could not find that public ballot.</Muted>
      </AppShell>
    )
  }
  if (simulation.isPending || simulation.data == null) {
    if (simulation.isError) {
      return (
        <AppShell width="lg">
          <Muted role="alert">{simulation.error.message}</Muted>
        </AppShell>
      )
    }
    return <ExplorerUnavailable loading ineligible={false} />
  }

  const original =
    ledger.originals.get(voterId) ??
    canonicalPayload(
      selected.payload,
      explorer.data.election,
      explorer.data.candidates,
    )
  // Seed from the pending hypothetical, not the stored ballot.
  const seedPayload = ledger.edits[voterId] ?? original
  const hasEdits = ledger.entries.length > 0

  return (
    <AppShell width="lg">
      <Stack gap={4}>
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            onClick={() => navigate(`/election/${electionId}/explore`)}
          >
            <ArrowLeft aria-hidden /> All voters
          </Button>
          <H1>Change {voterName(selected)}&apos;s ballot</H1>
          <Muted className="mt-1">Nothing here is saved to the election.</Muted>
        </div>

        {simulation.isError && (
          <Muted role="alert">{simulation.error.message}</Muted>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <CounterfactualBallotEditor
            key={voterId}
            source={selected}
            seedPayload={seedPayload}
            originalPayload={original}
            election={explorer.data.election}
            candidates={explorer.data.candidates}
            isEdited={voterId in ledger.edits}
            onChange={ledger.recordEdit}
            onRevert={() => {
              ledger.removeEdit(voterId)
              navigate(`/election/${electionId}/explore`)
            }}
          />
          <ConsequenceRail
            baseline={simulation.data.baseline}
            simulated={simulation.data.simulated}
            changed={simulation.data.changed}
            hasEdits={hasEdits}
            pending={simulation.isFetching}
            id="consequence-rail"
            className="lg:sticky lg:top-4"
          />
        </div>

        <EditLedger
          entries={ledger.entries}
          onRemove={(editedVoterId) => {
            ledger.removeEdit(editedVoterId)
            if (editedVoterId === voterId) {
              navigate(`/election/${electionId}/explore`)
            }
          }}
          onReset={() => {
            ledger.reset()
            navigate(`/election/${electionId}/explore`)
          }}
          onSelect={(editedVoterId) =>
            navigate(`/election/${electionId}/explore/${editedVoterId}`)
          }
        />
        <ConsequenceSummaryBar
          baseline={simulation.data.baseline}
          simulated={simulation.data.simulated}
          changed={simulation.data.changed}
          hasEdits={hasEdits}
          targetId="consequence-rail"
          className="lg:hidden"
        />
      </Stack>
    </AppShell>
  )
}

export function CounterfactualBallotEditor({
  source,
  seedPayload,
  originalPayload,
  election,
  candidates,
  isEdited,
  onChange,
  onRevert,
}: {
  source: EditableBallot
  seedPayload: Payload
  originalPayload: Payload
  election: Election
  candidates: Candidate[]
  isEdited: boolean
  onChange: (voterId: string, original: Payload, payload: Payload) => void
  onRevert: () => void
}) {
  const ballot = useBallotState({
    candidates,
    algorithms: election.algorithms,
    includeFptp: election.include_fptp,
    existingPayload: seedPayload,
  })
  const { getPayload } = ballot
  const reportChange = useCallback(() => {
    const payload = getPayload()
    if (
      !payloadsEqual(payload, seedPayload) ||
      !payloadsEqual(payload, originalPayload)
    ) {
      onChange(source.voter_id, originalPayload, payload)
    }
  }, [getPayload, onChange, originalPayload, seedPayload, source.voter_id])

  useEffect(() => reportChange(), [reportChange])

  return (
    <HypotheticalBallot
      voterName={voterName(source)}
      ballot={ballot}
      candidates={candidates}
      includeFptp={election.include_fptp}
      isEdited={isEdited}
      onRevert={onRevert}
    />
  )
}

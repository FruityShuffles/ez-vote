import { useEffect, useMemo, useState } from 'react'
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
import { FlipSearchPanel } from '@/components/counterfactual/FlipSearchPanel'
import { StrategicVotingPanel } from '@/components/counterfactual/StrategicVotingPanel'
import { CounterfactualBallotView } from '@/components/counterfactual/CounterfactualBallotView'
import { useWorkspaceElection } from '@/lib/electionWorkspace'
import { CenteredState } from '@/components/ui/centered-state'
import { Stack } from '@/components/ui/layout'
import { Spinner } from '@/components/ui/spinner'
import { H1, Muted } from '@/components/ui/typography'
import {
  FLIP_MAX_BALLOTS,
  FLIP_MAX_CANDIDATES,
  STRATEGY_MAX_BALLOTS,
  STRATEGY_MAX_CANDIDATES,
  type BallotOverride,
  useFlipSearch,
  useSimulate,
  useStoredSearches,
  useStrategySearch,
} from '@/lib/counterfactual'
import {
  summarizeChange,
  voterName,
  type FilterableBallot,
} from '@/lib/counterfactualFilter'
import { useCounterfactualStore } from '@/lib/counterfactualStore'
import { canonicalPayload } from '@/lib/ballotState'
import {
  useCandidates,
  usePublicBallots,
  type Candidate,
  type Election,
  type PublicBallot,
} from '@/lib/elections'
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

/** `canonicalPayload` bound to an election — see `@/lib/ballotState`. */
function canonicalFor(
  payload: Payload,
  election: Election,
  candidates: Candidate[],
): Payload {
  return canonicalPayload(
    payload,
    election.algorithms,
    candidates.map((candidate) => candidate.id),
    election.include_fptp,
  )
}

function useExplorerData(electionId: string, election: Election) {
  const candidatesQuery = useCandidates(electionId)
  const eligible = election.status === 'closed' && election.public_ballots
  const ballotsQuery = usePublicBallots(electionId, { enabled: eligible })

  const loading =
    candidatesQuery.isPending || (eligible && ballotsQuery.isPending)
  const error = candidatesQuery.isError || ballotsQuery.isError

  const data =
    !loading && !error && eligible
      ? {
          election,
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
    ineligible: election.status !== 'closed' || !election.public_ballots,
  }
}

function useLedger(electionId: string, data: ExplorerData | null) {
  const storedElectionId = useCounterfactualStore((state) => state.electionId)
  const storedEdits = useCounterfactualStore((state) => state.edits)
  const storedActiveSuggestion = useCounterfactualStore(
    (state) => state.activeSuggestion,
  )
  const selectElection = useCounterfactualStore((state) => state.selectElection)
  const recordEdit = useCounterfactualStore((state) => state.recordEdit)
  const removeEdit = useCounterfactualStore((state) => state.removeEdit)
  const applySuggestion = useCounterfactualStore(
    (state) => state.applySuggestion,
  )
  const reset = useCounterfactualStore((state) => state.reset)

  useEffect(() => selectElection(electionId), [electionId, selectElection])

  const edits = storedElectionId === electionId ? storedEdits : EMPTY_EDITS
  const activeSuggestion =
    storedElectionId === electionId ? storedActiveSuggestion : null
  const originals = useMemo(
    () =>
      new Map(
        (data?.ballots ?? []).map((ballot) => [
          ballot.voter_id,
          canonicalFor(ballot.payload, data!.election, data!.candidates),
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
        source:
          activeSuggestion != null && voterId in activeSuggestion
            ? 'suggested'
            : undefined,
      })),
    [activeSuggestion, data?.ballots, edits, nameOf, originals],
  )

  return {
    edits,
    activeSuggestion,
    originals,
    overrides,
    entries,
    nameOf,
    recordEdit,
    removeEdit,
    applySuggestion,
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
    <CenteredState>
      {loading ? (
        <Spinner className="size-6 text-muted-foreground" />
      ) : (
        <Muted role="alert">
          {ineligible
            ? 'What-if exploration is available only for closed elections with public ballots.'
            : 'Could not load the what-if explorer. Please try again.'}
        </Muted>
      )}
    </CenteredState>
  )
}

export function CounterfactualPicker() {
  const { id } = useParams<{ id: string }>()
  const electionId = id ?? ''
  const election = useWorkspaceElection()
  const navigate = useNavigate()
  const explorer = useExplorerData(electionId, election)
  const ledger = useLedger(electionId, explorer.data)
  const simulation = useSimulate(
    electionId,
    ledger.overrides,
    explorer.data != null,
  )
  // The precomputed answers (#146, #149) come from one row read, so it runs
  // unconditionally; `explorer.data != null` already implies closed +
  // public_ballots, so it never fires on an ineligible election. The live
  // searches are the fallback, each enabled only once the stored read has
  // provably come back without that answer — otherwise a precomputed election
  // could still pay for a second server-side search.
  const stored = useStoredSearches(electionId, explorer.data != null)
  const storedFlip = stored.data?.flip ?? undefined
  const storedStrategy = stored.data?.strategy ?? undefined
  const [flipRequested, setFlipRequested] = useState(false)
  const [strategyRequested, setStrategyRequested] = useState(false)
  const flip = useFlipSearch(
    electionId,
    flipRequested && !stored.isPending && storedFlip == null,
  )
  const strategy = useStrategySearch(
    electionId,
    strategyRequested && !stored.isPending && storedStrategy == null,
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
        <CenteredState>
          <Muted role="alert">{simulation.error.message}</Muted>
        </CenteredState>
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

  // The flip search only exists for IRV elections; within them, the server
  // caps input size, so explain the caps up front rather than surfacing a 400.
  // The ballot count comes from the simulate response because it includes
  // orphaned (deleted-account) ballots that `explorer.data.ballots` filters out.
  const flipEligible = election.algorithms.includes('irv')
  const flipUnavailableReason =
    simulation.data.ballot_count.baseline > FLIP_MAX_BALLOTS
      ? `This election is too large for the flip search (over ${FLIP_MAX_BALLOTS} ballots).`
      : explorer.data.candidates.length > FLIP_MAX_CANDIDATES
        ? `This election is too large for the flip search (over ${FLIP_MAX_CANDIDATES} candidates).`
        : undefined
  // The strategic search has no algorithm requirement — every method has a
  // strategy space — so the input caps are the only gate.
  const strategyUnavailableReason =
    simulation.data.ballot_count.baseline > STRATEGY_MAX_BALLOTS
      ? `This election is too large for the strategic voting search (over ${STRATEGY_MAX_BALLOTS} ballots).`
      : explorer.data.candidates.length > STRATEGY_MAX_CANDIDATES
        ? `This election is too large for the strategic voting search (over ${STRATEGY_MAX_CANDIDATES} candidates).`
        : undefined
  const ballots = explorer.data.ballots
  const voterNameOf = (voterId: string) =>
    voterName(
      ballots.find((ballot) => ballot.voter_id === voterId) ?? {
        display_name: null,
      },
    )

  // Both searches sit ABOVE the ballot grid (#149): they are the answers, and
  // the ballot list is the tool for exploring past them. Strategic voting leads
  // because it is the sharper question — what one named person could have done
  // alone, rather than what the electorate as a whole would have to do.
  return (
    <Stack gap={4}>
      <div>
        <H1>Explore what-ifs</H1>
        <Muted className="mt-1">
          Change a ballot hypothetically and compare how each method reacts.
        </Muted>
      </div>

      {simulation.isError && (
        <Muted role="alert">{simulation.error.message}</Muted>
      )}

      <StrategicVotingPanel
        result={storedStrategy ?? strategy.data}
        pending={stored.isPending || strategy.isFetching}
        error={strategy.error}
        requested={strategyRequested || storedStrategy != null}
        onSearch={() => {
          setStrategyRequested(true)
          if (strategy.isError) void strategy.refetch()
        }}
        originals={ledger.originals}
        nameOf={ledger.nameOf}
        voterNameOf={voterNameOf}
        edits={ledger.edits}
        activeSuggestion={ledger.activeSuggestion}
        onApply={ledger.applySuggestion}
        unavailableReason={strategyUnavailableReason}
      />

      {flipEligible && (
        <FlipSearchPanel
          result={storedFlip ?? flip.data}
          pending={stored.isPending || flip.isFetching}
          error={flip.error}
          requested={flipRequested || storedFlip != null}
          onSearch={() => {
            setFlipRequested(true)
            if (flip.isError) void flip.refetch()
          }}
          originals={ledger.originals}
          nameOf={ledger.nameOf}
          voterNameOf={voterNameOf}
          edits={ledger.edits}
          activeSuggestion={ledger.activeSuggestion}
          onApply={ledger.applySuggestion}
          unavailableReason={flipUnavailableReason}
        />
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
  )
}

export function CounterfactualEditor() {
  const { id, voterId = '' } = useParams<{
    id: string
    voterId: string
  }>()
  const electionId = id ?? ''
  const election = useWorkspaceElection()
  const navigate = useNavigate()
  const explorer = useExplorerData(electionId, election)
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
      <CenteredState>
        <Muted role="alert">Could not find that public ballot.</Muted>
      </CenteredState>
    )
  }
  if (simulation.isPending || simulation.data == null) {
    if (simulation.isError) {
      return (
        <CenteredState>
          <Muted role="alert">{simulation.error.message}</Muted>
        </CenteredState>
      )
    }
    return <ExplorerUnavailable loading ineligible={false} />
  }

  const original =
    ledger.originals.get(voterId) ??
    canonicalFor(
      selected.payload,
      explorer.data.election,
      explorer.data.candidates,
    )
  // The same working payload drives the ledger, simulation override, and every
  // editor control. Suggestions never get copied into a separate local state.
  const workingPayload = ledger.edits[voterId] ?? original
  const isSuggestionActive =
    ledger.activeSuggestion != null && voterId in ledger.activeSuggestion
  const hasEdits = ledger.entries.length > 0

  return (
    <Stack gap={4}>
      <div>
        <H1>Change {voterName(selected)}&apos;s ballot</H1>
        <Muted className="mt-1">Nothing here is saved to the election.</Muted>
      </div>

      {simulation.isError && (
        <Muted role="alert">{simulation.error.message}</Muted>
      )}

      {isSuggestionActive && (
        <Muted className="rounded-lg border border-dashed border-border p-2">
          This ballot is part of the active suggestion. Changing any ballot
          leaves that suggestion and makes it available to reapply.
        </Muted>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <CounterfactualBallotView
          key={voterId}
          voterName={voterName(selected)}
          payload={workingPayload}
          original={original}
          algorithms={explorer.data.election.algorithms}
          includeFptp={explorer.data.election.include_fptp}
          candidates={explorer.data.candidates}
          isEdited={voterId in ledger.edits}
          onChange={(payload) => ledger.recordEdit(voterId, original, payload)}
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
  )
}

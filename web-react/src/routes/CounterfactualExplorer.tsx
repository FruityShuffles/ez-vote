import { useEffect, useMemo, useRef, useState } from 'react'
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
import { HypotheticalBallot } from '@/components/counterfactual/HypotheticalBallot'
import { useWorkspaceElection } from '@/lib/electionWorkspace'
import { CenteredState } from '@/components/ui/centered-state'
import { Stack } from '@/components/ui/layout'
import { Spinner } from '@/components/ui/spinner'
import { H1, Muted } from '@/components/ui/typography'
import { payloadsEqual } from '@/lib/ballot'
import {
  FLIP_MAX_BALLOTS,
  FLIP_MAX_CANDIDATES,
  type BallotOverride,
  useFlipSearch,
  useSimulate,
} from '@/lib/counterfactual'
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
const EMPTY_FLIP_APPLIED: Record<string, true> = {}

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
  const storedFlipApplied = useCounterfactualStore((state) => state.flipApplied)
  const selectElection = useCounterfactualStore((state) => state.selectElection)
  const recordEdit = useCounterfactualStore((state) => state.recordEdit)
  const removeEdit = useCounterfactualStore((state) => state.removeEdit)
  const applyFlipChanges = useCounterfactualStore(
    (state) => state.applyFlipChanges,
  )
  const reset = useCounterfactualStore((state) => state.reset)

  useEffect(() => selectElection(electionId), [electionId, selectElection])

  const edits = storedElectionId === electionId ? storedEdits : EMPTY_EDITS
  const flipApplied =
    storedElectionId === electionId ? storedFlipApplied : EMPTY_FLIP_APPLIED
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
        source: flipApplied[voterId] === true ? 'flip' : undefined,
      })),
    [data?.ballots, edits, flipApplied, nameOf, originals],
  )

  return {
    edits,
    flipApplied,
    originals,
    overrides,
    entries,
    nameOf,
    recordEdit,
    removeEdit,
    applyFlipChanges,
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
  const [flipRequested, setFlipRequested] = useState(false)
  const flip = useFlipSearch(electionId, flipRequested)

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
  const ballots = explorer.data.ballots

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

        {flipEligible && (
          <FlipSearchPanel
            result={flip.data}
            pending={flip.isFetching}
            error={flip.error}
            requested={flipRequested}
            onSearch={() => {
              setFlipRequested(true)
              if (flip.isError) void flip.refetch()
            }}
            originals={ledger.originals}
            nameOf={ledger.nameOf}
            voterNameOf={(voterId) =>
              voterName(
                ballots.find((ballot) => ballot.voter_id === voterId) ?? {
                  display_name: null,
                },
              )
            }
            edits={ledger.edits}
            flipApplied={ledger.flipApplied}
            onApply={ledger.applyFlipChanges}
            unavailableReason={flipUnavailableReason}
          />
        )}

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
    canonicalPayload(
      selected.payload,
      explorer.data.election,
      explorer.data.candidates,
    )
  // Seed from the pending hypothetical, not the stored ballot — except for a
  // server flip suggestion, which must never enter the editor: the derivation
  // templates would rederive its `irv` key from scores and silently discard the
  // change on mount. Seeding from the original leaves the suggestion untouched
  // in the ledger until the user actually edits something, at which point the
  // manual edit wins and the suggestion is dropped.
  const isFlipApplied = ledger.flipApplied[voterId] === true
  const seedPayload = isFlipApplied
    ? original
    : (ledger.edits[voterId] ?? original)
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

        {isFlipApplied && (
          <Muted className="rounded-lg border border-dashed border-border p-2">
            A suggested change to this ballot is active. Below is the ballot as
            actually voted — changing anything replaces the suggestion.
          </Muted>
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
  // Report on mount and whenever the *user* changes the ballot — `getPayload`'s
  // identity tracks the editor state and nothing else. The other inputs are read
  // through a ref on purpose (#136): reacting to them re-runs the report on
  // unrelated re-renders, and in particular an undo-from-the-ledger clears the
  // store, re-renders this still-mounted editor, and would resurrect the edit
  // from the editor's own state before navigation unmounts it.
  const report = useRef({ seedPayload, originalPayload, onChange, source })
  useEffect(() => {
    report.current = { seedPayload, originalPayload, onChange, source }
  })
  useEffect(() => {
    const { seedPayload, originalPayload, onChange, source } = report.current
    const payload = getPayload()
    if (
      !payloadsEqual(payload, seedPayload) ||
      !payloadsEqual(payload, originalPayload)
    ) {
      onChange(source.voter_id, originalPayload, payload)
    }
  }, [getPayload])

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

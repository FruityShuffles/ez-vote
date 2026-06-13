import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { resultsQueryKey } from '@/lib/results'

// Domain types + data hooks for the election detail / dashboard surface (M9).
// Mirrors `lib/results.ts`: TanStack Query owns server state (the React stand-in
// for the Flutter Riverpod providers), row types are snake_case to match the DB,
// and each list/detail has a query-key factory. The migration is a client
// rewrite — the Supabase schema, RLS, and RPC contract are unchanged, so these
// queries port the Flutter repositories 1:1 (see `lib/data/repositories/`).

export type ElectionStatus = 'draft' | 'open' | 'closed'

/** A row from the `elections` table. */
export interface Election {
  id: string
  owner_id: string
  title: string
  description: string | null
  status: ElectionStatus
  algorithms: string[]
  invite_mode: string
  allow_voter_candidates: boolean
  realtime_results: boolean
  include_fptp: boolean
  public_ballots: boolean
  candidates_updated_at: string
  created_at: string
  updated_at: string
}

/** A row from the `candidates` table. Listed in `position` order (DET-01). */
export interface Candidate {
  id: string
  election_id: string
  name: string
  position: number
  created_at: string
}

/** The current user's own ballot row. `updated_at` is server-set (BAL-14). */
export interface Ballot {
  id: string
  election_id: string
  voter_id: string
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type VotingAlgorithm = 'approval' | 'irv' | 'star'

export interface ElectionFormInput {
  title: string
  description: string | null
  algorithms: VotingAlgorithm[]
  allow_voter_candidates: boolean
  realtime_results: boolean
  include_fptp: boolean
  public_ballots: boolean
  candidates: string[]
  open: boolean
}

// --- Query keys -------------------------------------------------------------

export const electionKeys = {
  owned: ['elections', 'owned'] as const,
  voted: ['elections', 'voted'] as const,
  pendingInvitations: ['elections', 'pending-invitations'] as const,
  detail: (id: string) => ['election', id] as const,
  candidates: (id: string) => ['candidates', id] as const,
  ballotCount: (id: string) => ['ballot-count', id] as const,
  existingBallot: (id: string) => ['existing-ballot', id] as const,
  voters: (id: string) => ['voters', id] as const,
  pendingInvitees: (id: string) => ['pending-invitees', id] as const,
}

/** Resolve the signed-in user id, or throw — every list below is user-scoped. */
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Not authenticated')
  return data.user.id
}

// --- Dashboard lists --------------------------------------------------------

/** Elections owned by the current user, newest first. */
export function useOwnedElections() {
  return useQuery({
    queryKey: electionKeys.owned,
    queryFn: async (): Promise<Election[]> => {
      const userId = await requireUserId()
      const { data, error } = await supabase
        .from('elections')
        .select()
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Election[]
    },
  })
}

/** Elections the current user has cast a ballot in, newest ballot first. */
export function useVotedElections() {
  return useQuery({
    queryKey: electionKeys.voted,
    queryFn: async (): Promise<Election[]> => {
      const userId = await requireUserId()
      const { data, error } = await supabase
        .from('ballots')
        .select('elections(*)')
        .eq('voter_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Each row embeds its joined election under `elections`. The generated
      // client types the embed loosely, so cast through `unknown`.
      return ((data ?? []) as unknown as Array<{ elections: Election | null }>)
        .map((row) => row.elections)
        .filter((e): e is Election => e != null)
    },
  })
}

/** Open elections the user is invited to but hasn't voted in yet. */
export function usePendingInvitations() {
  return useQuery({
    queryKey: electionKeys.pendingInvitations,
    queryFn: async (): Promise<Election[]> => {
      const { data, error } = await supabase.rpc('get_pending_invitations')
      if (error) throw error
      return (data ?? []) as Election[]
    },
  })
}

// --- Detail-surface reads ---------------------------------------------------

export function useElection(electionId: string) {
  return useQuery({
    queryKey: electionKeys.detail(electionId),
    enabled: electionId !== '',
    queryFn: async (): Promise<Election> => {
      const { data, error } = await supabase
        .from('elections')
        .select()
        .eq('id', electionId)
        .single()
      if (error) throw error
      return data as Election
    },
  })
}

export function useCandidates(electionId: string) {
  return useQuery({
    queryKey: electionKeys.candidates(electionId),
    enabled: electionId !== '',
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase
        .from('candidates')
        .select()
        .eq('election_id', electionId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data ?? []) as Candidate[]
    },
  })
}

export function buildCandidateRows(electionId: string, names: string[]) {
  return names.map((name, position) => ({
    election_id: electionId,
    name,
    position,
  }))
}

async function replaceCandidates(electionId: string, names: string[]) {
  const { error: deleteError } = await supabase
    .from('candidates')
    .delete()
    .eq('election_id', electionId)
  if (deleteError) throw deleteError

  const { error: insertError } = await supabase
    .from('candidates')
    .insert(buildCandidateRows(electionId, names))
  if (insertError) throw insertError
}

export function useSaveElection(electionId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ElectionFormInput): Promise<string> => {
      const electionFields = {
        title: input.title,
        description: input.description,
        algorithms: input.algorithms,
        allow_voter_candidates: input.allow_voter_candidates,
        realtime_results: input.realtime_results,
        include_fptp: input.include_fptp,
        public_ballots: input.public_ballots,
        ...(input.open ? { status: 'open' as const } : {}),
      }

      if (electionId) {
        const { data, error } = await supabase
          .from('elections')
          .update(electionFields)
          .eq('id', electionId)
          .select('id')
          .single()
        if (error) throw error
        await replaceCandidates(electionId, input.candidates)
        return data.id as string
      }

      const userId = await requireUserId()
      const { data, error } = await supabase
        .from('elections')
        .insert({
          ...electionFields,
          owner_id: userId,
          status: input.open ? 'open' : 'draft',
        })
        .select('id')
        .single()
      if (error) throw error

      const createdId = data.id as string
      try {
        await replaceCandidates(createdId, input.candidates)
      } catch (candidateError) {
        await supabase.from('elections').delete().eq('id', createdId)
        throw candidateError
      }
      return createdId
    },
    onSuccess: (savedId) => {
      qc.invalidateQueries({ queryKey: electionKeys.owned })
      qc.invalidateQueries({ queryKey: electionKeys.detail(savedId) })
      qc.invalidateQueries({ queryKey: electionKeys.candidates(savedId) })
    },
  })
}

/** The current user's ballot for this election, or null if they haven't voted. */
export function useExistingBallot(electionId: string) {
  return useQuery({
    queryKey: electionKeys.existingBallot(electionId),
    queryFn: async (): Promise<Ballot | null> => {
      const userId = await requireUserId()
      const { data, error } = await supabase
        .from('ballots')
        .select()
        .eq('election_id', electionId)
        .eq('voter_id', userId)
        .maybeSingle()
      if (error) throw error
      return (data as Ballot | null) ?? null
    },
  })
}

export function useBallotCount(electionId: string) {
  return useQuery({
    queryKey: electionKeys.ballotCount(electionId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('get_ballot_count', {
        p_election_id: electionId,
      })
      if (error) throw error
      return (data as number | null) ?? 0
    },
  })
}

/** Display names of voters who have submitted a ballot. */
export function useElectionVoters(electionId: string) {
  return useQuery({
    queryKey: electionKeys.voters(electionId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('get_election_voters', {
        p_election_id: electionId,
      })
      if (error) throw error
      return ((data ?? []) as Array<{ display_name: string | null }>).map(
        (row) => row.display_name ?? '',
      )
    },
  })
}

/** Display names of invitees who have not yet voted. */
export function usePendingInvitees(electionId: string) {
  return useQuery({
    queryKey: electionKeys.pendingInvitees(electionId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('get_pending_invitees', {
        p_election_id: electionId,
      })
      if (error) throw error
      return ((data ?? []) as Array<{ display_name: string | null }>).map(
        (row) => row.display_name ?? '',
      )
    },
  })
}

// --- Mutations --------------------------------------------------------------

/** Draft → Open. Just flips status; no compute. */
export function useOpenElection(electionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('elections')
        .update({ status: 'open' })
        .eq('id', electionId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: electionKeys.detail(electionId) })
      qc.invalidateQueries({ queryKey: electionKeys.owned })
    },
  })
}

/**
 * Open → Closed. Delegates to the `compute-results` edge function with
 * `close: true`, which tabulates, persists results, and closes the election —
 * the same call the Flutter `ResultRepository.computeResults` makes.
 */
export function useCloseElection(electionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('compute-results', {
        body: { election_id: electionId, close: true },
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: electionKeys.detail(electionId) })
      qc.invalidateQueries({ queryKey: electionKeys.owned })
      qc.invalidateQueries({ queryKey: resultsQueryKey(electionId) })
    },
  })
}

/**
 * Append a voter-suggested candidate (ad-hoc elections). Computes the next
 * `position` so entry order is preserved (DET-01/CRT-01). A duplicate name
 * surfaces as a unique violation (`23505`); callers use `isUniqueViolation`.
 */
export function useAddCandidate(electionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: existing, error: posError } = await supabase
        .from('candidates')
        .select('position')
        .eq('election_id', electionId)
        .order('position', { ascending: false })
        .limit(1)
      if (posError) throw posError
      const nextPosition =
        existing && existing.length > 0
          ? (existing[0].position as number) + 1
          : 0
      const { error } = await supabase.from('candidates').insert({
        election_id: electionId,
        name,
        position: nextPosition,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: electionKeys.candidates(electionId) })
      // Refresh the election so `candidates_updated_at` advances, which drives
      // the voter stale-ballot warning (DET-06).
      qc.invalidateQueries({ queryKey: electionKeys.detail(electionId) })
    },
  })
}

/** Delete an election the user owns (dashboard owned-list action). */
export function useDeleteElection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (electionId: string) => {
      const { error } = await supabase
        .from('elections')
        .delete()
        .eq('id', electionId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: electionKeys.owned })
    },
  })
}

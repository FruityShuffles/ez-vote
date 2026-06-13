import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { arrayMove } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/auth/context'
import { AppShell } from '@/components/ui/app-shell'
import { SortableList, SortableRow } from '@/components/ballot/SortableList'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { H1, Muted } from '@/components/ui/typography'
import { friendlyError, isUniqueViolation } from '@/lib/errors'
import {
  useCandidates,
  useElection,
  useSaveElection,
  type ElectionFormInput,
  type VotingAlgorithm,
} from '@/lib/elections'

type CandidateDraft = { id: string; name: string }
type FormState = Omit<ElectionFormInput, 'candidates' | 'open'> & {
  candidates: CandidateDraft[]
}

const initialState: FormState = {
  title: '',
  description: null,
  algorithms: ['approval'],
  allow_voter_candidates: false,
  realtime_results: false,
  include_fptp: true,
  public_ballots: false,
  candidates: [newCandidate(), newCandidate()],
}

function newCandidate(name = ''): CandidateDraft {
  return { id: crypto.randomUUID(), name }
}

const algorithmCopy: Record<
  VotingAlgorithm,
  { title: string; description: string }
> = {
  approval: {
    title: 'Approval Voting',
    description:
      'Vote for every acceptable candidate; the most approvals wins.',
  },
  irv: {
    title: 'Instant Runoff Voting (IRV)',
    description:
      'Rank candidates; last-place candidates are eliminated until one wins.',
  },
  star: {
    title: 'STAR Voting',
    description:
      'Score candidates 0-5; the top two advance to an automatic runoff.',
  },
}

export function ElectionForm() {
  const { id: electionId } = useParams()
  const editing = electionId != null
  const navigate = useNavigate()
  const { user } = useAuth()
  const electionQuery = useElection(electionId ?? '')
  const candidatesQuery = useCandidates(electionId ?? '')
  const save = useSaveElection(electionId)
  const [form, setForm] = useState<FormState>(initialState)
  const [initialized, setInitialized] = useState(!editing)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const allowNavigation = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigation.current &&
      dirty &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [dirty])

  useEffect(() => {
    if (!editing || initialized || !electionQuery.data || !candidatesQuery.data)
      return
    const election = electionQuery.data
    // Hydrate the local draft exactly once after both edit queries resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      title: election.title,
      description: election.description,
      algorithms: election.algorithms.filter(isAlgorithm),
      allow_voter_candidates: election.allow_voter_candidates,
      realtime_results: election.realtime_results,
      include_fptp: election.include_fptp,
      public_ballots: election.public_ballots,
      candidates: ensureTwo(
        candidatesQuery.data.map((candidate) => newCandidate(candidate.name)),
      ),
    })
    setInitialized(true)
  }, [editing, initialized, electionQuery.data, candidatesQuery.data])

  const loading =
    editing &&
    (!initialized || electionQuery.isPending || candidatesQuery.isPending)
  const loadError =
    editing && (electionQuery.isError || candidatesQuery.isError)
  const unauthorized =
    editing && electionQuery.data && electionQuery.data.owner_id !== user?.id

  function update(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }))
    setDirty(true)
  }

  function validate(): string[] | null {
    const nextErrors: Record<string, string> = {}
    const names = form.candidates
      .map((candidate) => candidate.name.trim())
      .filter(Boolean)
    if (!form.title.trim()) nextErrors.title = 'Title required'
    if (names.length < 2)
      nextErrors.candidates = 'At least 2 candidates required'
    if (
      new Set(names.map((name) => name.toLocaleLowerCase())).size !==
      names.length
    ) {
      nextErrors.candidates = 'Candidate names must be unique'
    }
    if (form.algorithms.length === 0)
      nextErrors.algorithms = 'Select at least one algorithm'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0 ? names : null
  }

  async function submit(open: boolean) {
    const names = validate()
    if (!names) return
    try {
      const savedId = await save.mutateAsync({
        ...form,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        candidates: names,
        open,
      })
      allowNavigation.current = true
      setDirty(false)
      blocker.reset?.()
      navigate(`/election/${savedId}`, { replace: true })
    } catch (error) {
      toast.error(
        isUniqueViolation(error)
          ? 'Candidate names must be unique'
          : friendlyError(
              error,
              'Could not save the election. Please try again.',
            ),
      )
    }
  }

  if (loading)
    return (
      <CenteredState>
        <Spinner className="size-6" />
      </CenteredState>
    )
  if (loadError)
    return (
      <CenteredState>
        <Muted role="alert">Could not load this election.</Muted>
      </CenteredState>
    )
  if (unauthorized || (editing && electionQuery.data?.status !== 'draft')) {
    return (
      <CenteredState>
        <Muted role="alert">This draft cannot be edited.</Muted>
      </CenteredState>
    )
  }

  return (
    <AppShell
      width="md"
      actions={
        <Button
          variant="outline"
          onClick={() =>
            navigate(editing ? `/election/${electionId}` : '/dashboard')
          }
        >
          Cancel
        </Button>
      }
    >
      <form
        className="mx-auto max-w-2xl space-y-8"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(true)
        }}
      >
        <div>
          <H1>{editing ? 'Edit Election' : 'Create Election'}</H1>
          <Muted className="mt-1">
            Set up the ballot, candidates, and voting options.
          </Muted>
        </div>

        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="title">Election Title</FieldLabel>
          <Input
            id="title"
            value={form.title}
            aria-invalid={!!errors.title}
            onChange={(event) => update({ title: event.target.value })}
          />
          <FieldError>{errors.title}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
          <Textarea
            id="description"
            rows={3}
            value={form.description ?? ''}
            onChange={(event) => update({ description: event.target.value })}
          />
        </Field>

        <CandidateFields
          candidates={form.candidates}
          error={errors.candidates}
          onChange={(candidates) => update({ candidates })}
        />

        <FieldSet>
          <FieldLegend>Voting Algorithms</FieldLegend>
          {(['approval', 'irv', 'star'] as VotingAlgorithm[]).map(
            (algorithm) => (
              <Field key={algorithm} orientation="horizontal">
                <Checkbox
                  id={`algorithm-${algorithm}`}
                  checked={form.algorithms.includes(algorithm)}
                  onCheckedChange={(checked) =>
                    update({
                      algorithms: checked
                        ? [...form.algorithms, algorithm]
                        : form.algorithms.filter(
                            (value) => value !== algorithm,
                          ),
                    })
                  }
                />
                <div>
                  <FieldLabel htmlFor={`algorithm-${algorithm}`}>
                    {algorithmCopy[algorithm].title}
                  </FieldLabel>
                  <FieldDescription>
                    {algorithmCopy[algorithm].description}
                  </FieldDescription>
                </div>
              </Field>
            ),
          )}
          <FieldError>{errors.algorithms}</FieldError>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Settings</FieldLegend>
          <Setting
            label="Allow voters to add candidates"
            description="Participants can suggest new candidates while the election is open"
            checked={form.allow_voter_candidates}
            onChange={(value) => update({ allow_voter_candidates: value })}
          />
          <Setting
            label="Show real-time results"
            description="Results update after each vote"
            checked={form.realtime_results}
            onChange={(value) => update({ realtime_results: value })}
          />
          <Setting
            label="Include FPTP comparison"
            description="Compare results to simple plurality (first-past-the-post) voting"
            checked={form.include_fptp}
            onChange={(value) => update({ include_fptp: value })}
          />
          <Setting
            label="Public ballots"
            description="Anyone in the election can see how each voter voted."
            checked={form.public_ballots}
            onChange={(value) => update({ public_ballots: value })}
          />
        </FieldSet>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => void submit(false)}
          >
            {editing ? 'Save Changes' : 'Save as Draft'}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4" />}Save & Open
          </Button>
        </div>
      </form>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              Your election changes have not been saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDirty(false)
                blocker.proceed?.()
              }}
            >
              Discard
            </Button>
            {!editing && (
              <Button onClick={() => void submit(false)}>Save as Draft</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

function CandidateFields({
  candidates,
  error,
  onChange,
}: {
  candidates: CandidateDraft[]
  error?: string
  onChange: (candidates: CandidateDraft[]) => void
}) {
  function reorder(activeId: string, overId: string) {
    const oldIndex = candidates.findIndex(
      (candidate) => candidate.id === activeId,
    )
    const newIndex = candidates.findIndex(
      (candidate) => candidate.id === overId,
    )
    onChange(arrayMove(candidates, oldIndex, newIndex))
  }
  return (
    <FieldSet>
      <FieldLegend>Candidates</FieldLegend>
      <SortableList
        ids={candidates.map((candidate) => candidate.id)}
        onReorder={reorder}
      >
        {candidates.map((candidate, index) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            index={index}
            count={candidates.length}
            onChange={(name) =>
              onChange(
                candidates.map((item) =>
                  item.id === candidate.id ? { ...item, name } : item,
                ),
              )
            }
            onMove={(offset) =>
              onChange(arrayMove(candidates, index, index + offset))
            }
            onRemove={() =>
              onChange(candidates.filter((item) => item.id !== candidate.id))
            }
          />
        ))}
      </SortableList>
      <Button
        type="button"
        variant="ghost"
        className="w-fit"
        onClick={() => onChange([...candidates, newCandidate()])}
      >
        <Plus /> Add Candidate
      </Button>
      <FieldError>{error}</FieldError>
    </FieldSet>
  )
}

function CandidateRow({
  candidate,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  candidate: CandidateDraft
  index: number
  count: number
  onChange: (name: string) => void
  onMove: (offset: number) => void
  onRemove: () => void
}) {
  return (
    <SortableRow id={candidate.id}>
      <div className="flex items-center gap-1">
        <Input
          aria-label={`Candidate ${index + 1}`}
          value={candidate.name}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move candidate ${index + 1} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move candidate ${index + 1} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
        {count > 2 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove candidate ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </SortableRow>
  )
}

function Setting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = `setting-${label.toLowerCase().replaceAll(' ', '-')}`
  return (
    <Field orientation="horizontal">
      <div className="flex-1">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <AppShell width="md">
      <div className="flex justify-center py-20">{children}</div>
    </AppShell>
  )
}

function ensureTwo(candidates: CandidateDraft[]) {
  const result = [...candidates]
  while (result.length < 2) result.push(newCandidate())
  return result
}

function isAlgorithm(value: string): value is VotingAlgorithm {
  return value === 'approval' || value === 'irv' || value === 'star'
}

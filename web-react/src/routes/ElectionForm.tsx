import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { arrayMove } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/auth/context'
import { SortableList, SortableRow } from '@/components/ballot/SortableList'
import { useWorkspaceElection } from '@/lib/electionWorkspace'
import { Button } from '@/components/ui/button'
import { CenteredState } from '@/components/ui/centered-state'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  clearElectionDraft,
  electionDraftKey,
  readElectionDraft,
  writeElectionDraft,
  type CandidateDraft,
  type ElectionDraftForm,
} from '@/lib/electionDrafts'
import { LearnContent, type AlgoKey } from '@/routes/Learn'
import {
  useCandidates,
  useSaveElection,
  type Election,
  type VotingAlgorithm,
} from '@/lib/elections'

type FormState = ElectionDraftForm

function initialState(): FormState {
  return {
    title: '',
    description: null,
    algorithms: ['approval'],
    allow_voter_candidates: false,
    realtime_results: false,
    include_fptp: true,
    public_ballots: false,
    candidates: [newCandidate(), newCandidate()],
  }
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
  return <ElectionFormContent />
}

export function ElectionEdit() {
  const election = useWorkspaceElection()
  return <ElectionFormContent election={election} />
}

function ElectionFormContent({ election }: { election?: Election }) {
  const { id: electionId } = useParams()
  const editing = election != null
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const candidatesQuery = useCandidates(electionId ?? '')
  const save = useSaveElection(electionId)
  const draftKey = electionDraftKey(editing ? electionId : undefined)
  const [createDraft] = useState(() =>
    editing ? null : readElectionDraft(draftKey),
  )
  const sourceUpdatedAt = useRef<string | null>(null)
  const [form, setForm] = useState<FormState>(
    () => createDraft?.form ?? initialState(),
  )
  const [initialized, setInitialized] = useState(!editing)
  const [dirty, setDirty] = useState(createDraft != null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const allowNavigation = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigation.current &&
      dirty &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!editing || initialized || !election || !candidatesQuery.data)
      return
    const serverForm: FormState = {
      title: election.title,
      description: election.description,
      algorithms: election.algorithms.filter(isAlgorithm),
      allow_voter_candidates: election.allow_voter_candidates,
      realtime_results: election.realtime_results,
      include_fptp: election.include_fptp,
      public_ballots: election.public_ballots,
      candidates: normalize(
        candidatesQuery.data.map((candidate) => newCandidate(candidate.name)),
      ),
    }
    const draft = readElectionDraft(draftKey)
    const resumeDraft = draft?.sourceUpdatedAt === election.updated_at
    sourceUpdatedAt.current = election.updated_at
    // Hydrate the local draft exactly once after both edit queries resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(resumeDraft ? draft.form : serverForm)
    setDirty(resumeDraft)
    if (draft && !resumeDraft) clearElectionDraft(draftKey)
    setInitialized(true)
  }, [draftKey, editing, initialized, election, candidatesQuery.data])

  useEffect(() => {
    if (!initialized || !dirty) return
    writeElectionDraft(draftKey, form, sourceUpdatedAt.current)
  }, [dirty, draftKey, form, initialized])

  const loading =
    editing && (!initialized || candidatesQuery.isPending)
  const loadError = editing && candidatesQuery.isError
  const unauthorized = editing && election && election.owner_id !== user?.id

  function cancel() {
    if (!editing) navigate('/dashboard')
    else if (location.state?.from === 'election-detail') navigate(-1)
    else navigate(`/election/${electionId}`, { replace: true })
  }

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
      clearElectionDraft(draftKey)
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
  if (unauthorized || (editing && election?.status !== 'draft')) {
    return (
      <CenteredState>
        <Muted role="alert">This draft cannot be edited.</Muted>
      </CenteredState>
    )
  }

  return (
    <>
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
          <FieldLegend>
            <h2>Voting Algorithms</h2>
          </FieldLegend>
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
          <FieldLegend>
            <h2>Settings</h2>
          </FieldLegend>
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
            id="setting-include-fptp"
            label="Include first-past-the-post (FPTP) comparison"
            description={
              <>
                Compare results to plurality voting, where the candidate with
                the most first choices wins. <LearnDialogLink />
              </>
            }
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

        <div className="flex flex-col gap-3">
          {/* "Open" starts voting immediately, which nothing else on the
              screen says. Edit mode has no draft button, so the line would
              describe an action that isn't there. */}
          {!editing && (
            <p className="text-sm text-muted-foreground sm:text-right">
              <strong className="font-medium text-foreground">Open</strong> —
              voters can start voting right away.{' '}
              <strong className="font-medium text-foreground">Draft</strong> —
              keep editing privately.
            </p>
          )}
          {/* Primary last in the DOM: right-most on desktop, and on top on
              mobile via flex-col-reverse. Same recipe as the shared
              DialogFooter — see the action row convention in
              docs/Migration/Design System.md. */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={cancel}
            >
              Cancel
            </Button>
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
            <DialogTitle>Draft saved — resume later?</DialogTitle>
            <DialogDescription>
              Your changes are saved in this browser. You can leave now and
              continue when you return.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button
              onClick={() => blocker.proceed?.()}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocus = useRef<string | null>(null)

  // Focus a row that only exists after the next render (pasted rows).
  useEffect(() => {
    const id = pendingFocus.current
    if (id == null) return
    pendingFocus.current = null
    inputs.current.get(id)?.focus()
  })

  // The last row is the open slot once it sits past the two required rows —
  // so a fresh form still reads as "Candidate 1 / Candidate 2", and only the
  // row Rule A appended gets placeholder treatment.
  const lastIndex = candidates.length - 1
  const trailingId =
    lastIndex >= 2 && isBlank(candidates[lastIndex])
      ? candidates[lastIndex].id
      : null
  const realCount =
    trailingId == null ? candidates.length : candidates.length - 1

  function commit(next: CandidateDraft[]) {
    const normalized = normalize(next)
    if (normalized !== candidates) onChange(normalized)
  }

  function reorder(activeId: string, overId: string) {
    const oldIndex = candidates.findIndex(
      (candidate) => candidate.id === activeId,
    )
    const newIndex = candidates.findIndex(
      (candidate) => candidate.id === overId,
    )
    commit(arrayMove(candidates, oldIndex, newIndex))
  }

  // Splitting a multi-line paste means an organizer can bring a list in from a
  // spreadsheet or notes app in one gesture.
  function pasteList(index: number, text: string) {
    const names = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (names.length === 0) return
    const extra = names.slice(1).map((name) => newCandidate(name))
    const next = candidates.map((candidate, position) =>
      position === index ? { ...candidate, name: names[0] } : candidate,
    )
    next.splice(index + 1, 0, ...extra)
    pendingFocus.current = extra.at(-1)?.id ?? candidates[index].id
    commit(next)
  }

  return (
    <FieldSet>
      <FieldLegend>
        <h2>Candidates</h2>
      </FieldLegend>
      <SortableList
        ids={candidates.map((candidate) => candidate.id)}
        onReorder={reorder}
      >
        {candidates.map((candidate, index) => (
          <CandidateRow
            key={candidate.id}
            candidate={candidate}
            index={index}
            count={realCount}
            trailing={candidate.id === trailingId}
            inputRef={(element) => {
              if (element) inputs.current.set(candidate.id, element)
              else inputs.current.delete(candidate.id)
            }}
            onChange={(name) =>
              commit(
                candidates.map((item) =>
                  item.id === candidate.id ? { ...item, name } : item,
                ),
              )
            }
            onEnter={() => {
              const next = candidates[index + 1]
              if (next) inputs.current.get(next.id)?.focus()
            }}
            onBlurRow={() => commit(collapse(candidates, candidate.id))}
            onPasteList={(text) => pasteList(index, text)}
            onMove={(offset) =>
              commit(arrayMove(candidates, index, index + offset))
            }
            onRemove={() =>
              commit(candidates.filter((item) => item.id !== candidate.id))
            }
          />
        ))}
      </SortableList>
      <FieldError>{error}</FieldError>
    </FieldSet>
  )
}

function CandidateRow({
  candidate,
  index,
  count,
  trailing,
  inputRef,
  onChange,
  onEnter,
  onBlurRow,
  onPasteList,
  onMove,
  onRemove,
}: {
  candidate: CandidateDraft
  index: number
  count: number
  trailing: boolean
  inputRef: (element: HTMLInputElement | null) => void
  onChange: (name: string) => void
  onEnter: () => void
  onBlurRow: () => void
  onPasteList: (text: string) => void
  onMove: (offset: number) => void
  onRemove: () => void
}) {
  return (
    <SortableRow id={candidate.id} disabled={trailing} handleSpacer={trailing}>
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          aria-label={
            trailing ? 'Add another candidate' : `Candidate ${index + 1}`
          }
          placeholder={trailing ? 'Add another candidate…' : undefined}
          enterKeyHint={trailing ? 'done' : 'next'}
          value={candidate.name}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter walks down the list instead of submitting the form; from the
            // last filled row it lands on the open slot Rule A guarantees.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            onEnter()
          }}
          onBlur={onBlurRow}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text/plain')
            if (!text.includes('\n')) return
            event.preventDefault()
            onPasteList(text)
          }}
        />
        {!trailing && (
          <>
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
          </>
        )}
      </div>
    </SortableRow>
  )
}

function Setting({
  id: explicitId,
  label,
  description,
  checked,
  onChange,
}: {
  // Derived from the label by default; pass one explicitly when the label has
  // characters that make a hostile selector (parentheses, punctuation).
  id?: string
  label: string
  description: React.ReactNode
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = explicitId ?? `setting-${label.toLowerCase().replaceAll(' ', '-')}`
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

function LearnDialogLink() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const learn = params.get('learn')
  const selected = isLearnAlgorithm(learn) ? learn : null

  function close() {
    if (location.state?.from === 'learn-dialog') navigate(-1)
    else navigate(location.pathname, { replace: true })
  }

  return (
    <Dialog
      open={selected != null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogTrigger
        render={
          <Link
            to={{ pathname: location.pathname, search: '?learn=fptp' }}
            state={{ from: 'learn-dialog' }}
            preventScrollReset
          />
        }
      >
        What&rsquo;s this?
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Learn About Voting Algorithms</DialogTitle>
          <DialogDescription className="sr-only">
            Compare the voting algorithms supported by EZVote.
          </DialogDescription>
        </DialogHeader>
        <LearnContent
          selected={selected ?? 'fptp'}
          onSelect={(key) =>
            setParams(
              { learn: key },
              {
                replace: true,
                state: { from: 'learn-dialog' },
                preventScrollReset: true,
              },
            )
          }
        />
      </DialogContent>
    </Dialog>
  )
}

function isLearnAlgorithm(value: string | null): value is AlgoKey {
  return (
    value === 'approval' ||
    value === 'irv' ||
    value === 'star' ||
    value === 'fptp'
  )
}

function isBlank(candidate: CandidateDraft) {
  return candidate.name.trim() === ''
}

// Rule A (#118): the list keeps exactly one open slot at the bottom, on a floor
// of two rows — so there is never a moment without somewhere to type, and the
// explicit "Add Candidate" button is unnecessary. Returns the input array
// untouched when nothing changes, so callers can skip a no-op state update
// (which would otherwise mark the form dirty just for focusing a field).
function normalize(candidates: CandidateDraft[]): CandidateDraft[] {
  if (candidates.length >= 2 && candidates.some(isBlank)) return candidates
  const result = [...candidates]
  while (result.length < 2) result.push(newCandidate())
  if (result.every((candidate) => !isBlank(candidate)))
    result.push(newCandidate())
  return result
}

// Rule B (#118): leaving an emptied row drops it, so clearing a name is a way to
// delete a candidate. Never below the floor of two rows, and never the list's
// only blank row — that one is the open slot Rule A guarantees.
function collapse(candidates: CandidateDraft[], id: string): CandidateDraft[] {
  if (candidates.length <= 2) return candidates
  const target = candidates.find((candidate) => candidate.id === id)
  if (!target || !isBlank(target)) return candidates
  if (candidates.filter(isBlank).length < 2) return candidates
  return candidates.filter((candidate) => candidate.id !== id)
}

function isAlgorithm(value: string): value is VotingAlgorithm {
  return value === 'approval' || value === 'irv' || value === 'star'
}

import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Plus } from 'lucide-react'

import { useAuth } from '@/auth/context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { H1, H2, Muted } from '@/components/ui/typography'
import { Stack } from '@/components/ui/layout'
import { cn } from '@/lib/utils'
import { ElectionTable } from '@/components/elections/ElectionTable'
import type { VoteStatus } from '@/components/elections/ElectionTable'
import { LearnContent } from '@/routes/Learn'
import type { Election } from '@/lib/elections'
import {
  useCaseStudies,
  useOwnedElections,
  usePendingInvitations,
  useVotedElections,
} from '@/lib/elections'

// The election-list dashboard (M9), ported from Flutter `HomeScreen`. Three
// tabs: My Elections, Learn (the same static explainer as /learn), and Case
// Studies. No polling: tab switches refetch on demand, realtime is M15.
//
// Flutter (and React until #134) split the list into My Elections (owned) and
// My Votes (invited + voted), which double-listed anything you both created and
// voted in. One list now carries every election you're involved in, and the
// owner/voted distinction moved onto the row itself as status icons.

type Tab = 'elections' | 'learn' | 'case-studies'

export function Dashboard() {
  const navigate = useNavigate()
  const { isGuest } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = resolveTab(params.get('tab'), isGuest)

  function selectTab(nextTab: Tab) {
    const next = new URLSearchParams(params)
    next.set('tab', nextTab)
    setParams(next, { replace: true, preventScrollReset: true })
  }

  return (
    <Stack gap={6}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H1>Dashboard</H1>
        {!isGuest && (
          <Button onClick={() => navigate('/create')}>
            <Plus /> New Election
          </Button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="flex gap-1 border-b"
      >
        <TabButton
          active={tab === 'elections'}
          onClick={() => selectTab('elections')}
        >
          {isGuest && <Lock className="size-3.5" aria-hidden />}
          My Elections
        </TabButton>
        <TabButton active={tab === 'learn'} onClick={() => selectTab('learn')}>
          Learn
        </TabButton>
        <TabButton
          active={tab === 'case-studies'}
          onClick={() => selectTab('case-studies')}
        >
          Case Studies
        </TabButton>
      </div>

      {tab === 'elections' &&
        (isGuest ? <LockedMyElections /> : <MyElections />)}
      {tab === 'learn' && <LearnContent />}
      {tab === 'case-studies' && <CaseStudies />}
    </Stack>
  )
}

/**
 * `owned` and `votes` are the pre-#134 tab values. Account users still land on
 * the combined list from those or any unknown value; guests land on Case
 * Studies unless they explicitly select My Elections.
 */
function resolveTab(value: string | null, isGuest: boolean): Tab {
  if (value === 'learn' || value === 'case-studies') return value
  if (value === 'elections') return value
  return isGuest ? 'case-studies' : 'elections'
}

function LockedMyElections() {
  return (
    <Card role="region" aria-label="My Elections requires an account">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <Lock className="size-5" aria-hidden />
        </div>
        <div>
          <H2 className="text-lg">Create an account for your elections</H2>
          <Muted className="mt-1">
            Create elections, cast ballots, and keep track of every election you
            join.
          </Muted>
        </div>
        <Link to="/signup" className={buttonVariants()}>
          Create account
        </Link>
      </CardContent>
    </Card>
  )
}

function CaseStudies() {
  const studies = useCaseStudies()

  if (studies.isPending) return <ListSpinner />
  if (studies.isError) {
    return (
      <Muted role="alert">Could not load case studies. Please try again.</Muted>
    )
  }
  if (studies.data.length === 0) {
    return <Muted>No case studies are available yet.</Muted>
  }

  return (
    <ElectionTable
      variant="case-studies"
      label="Case studies"
      rows={studies.data.map((election) => ({
        election,
        owned: false,
        voteStatus: null,
      }))}
    />
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2 py-2 text-sm font-medium outline-none transition-colors sm:px-3',
        'focus-visible:ring-3 focus-visible:ring-ring/50',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Every election the user owns or was invited to, newest first. The three
 * queries stay separate — they are separate RLS paths, and each is invalidated
 * by different mutations — and are merged here for display.
 */
function MyElections() {
  const { user } = useAuth()
  const owned = useOwnedElections()
  const voted = useVotedElections()
  const invited = usePendingInvitations()

  // Wait for all three before rendering: a partial list would reorder under the
  // user as the rest arrive.
  if (owned.isPending || voted.isPending || invited.isPending) {
    return <ListSpinner />
  }
  if (owned.isError && voted.isError && invited.isError) {
    return (
      <Muted role="alert">
        Could not load your elections. Please try again.
      </Muted>
    )
  }

  const votedList = voted.data ?? []
  // With either vote-derived query down we can't tell voted from not-voted, so
  // show no icon rather than a wrong one. Ownership still comes through.
  const voteStatusKnown = !voted.isError && !invited.isError
  const votedIds = new Set(votedList.map((e) => e.id))

  const byId = new Map<string, Election>()
  for (const e of [
    ...(owned.data ?? []),
    ...votedList,
    ...(invited.data ?? []),
  ]) {
    byId.set(e.id, e)
  }
  const elections = [...byId.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )

  if (elections.length === 0) {
    return <Muted>No elections yet. Create one!</Muted>
  }

  return (
    <ElectionTable
      variant="mine"
      label="My elections"
      rows={elections.map((e) => ({
        election: e,
        owned: e.owner_id === user?.id,
        voteStatus: voteStatusKnown ? voteStatus(e, votedIds) : null,
      }))}
    />
  )
}

/**
 * Voted elections are known outright. "Not voted" is claimed only while the
 * election is still open — a draft has no ballot to cast, and a closed election
 * you skipped is history, not a call to action.
 */
function voteStatus(
  election: Election,
  votedIds: Set<string>,
): VoteStatus | null {
  if (votedIds.has(election.id)) return 'voted'
  return election.status === 'open' ? 'not-voted' : null
}

function ListSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

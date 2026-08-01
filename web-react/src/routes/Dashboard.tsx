import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { H1, H2, Muted } from '@/components/ui/typography'
import { Stack } from '@/components/ui/layout'
import { cn } from '@/lib/utils'
import { ElectionCard } from '@/components/elections/ElectionCard'
import { LearnContent } from '@/routes/Learn'
import {
  useOwnedElections,
  usePendingInvitations,
  useVotedElections,
} from '@/lib/elections'

// The election-list dashboard (M9), ported from Flutter `HomeScreen`. Three
// tabs, matching Flutter: My Elections (owned), My Votes (pending invitations
// + voted), and Learn (the same static explainer as /learn). No polling: tab
// switches refetch on demand, realtime is M15.

type Tab = 'owned' | 'votes' | 'learn'

export function Dashboard() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab: Tab = isTab(rawTab) ? rawTab : 'owned'

  function selectTab(nextTab: Tab) {
    const next = new URLSearchParams(params)
    next.set('tab', nextTab)
    setParams(next, { replace: true, preventScrollReset: true })
  }

  return (
    <Stack gap={6}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H1>Dashboard</H1>
        <Button onClick={() => navigate('/create')}>
          <Plus /> New Election
        </Button>
      </div>

      <div role="tablist" aria-label="Dashboard sections" className="flex gap-1 border-b">
        <TabButton
          active={tab === 'owned'}
          onClick={() => selectTab('owned')}
        >
          My Elections
        </TabButton>
        <TabButton
          active={tab === 'votes'}
          onClick={() => selectTab('votes')}
        >
          My Votes
        </TabButton>
        <TabButton
          active={tab === 'learn'}
          onClick={() => selectTab('learn')}
        >
          Learn
        </TabButton>
      </div>

      {tab === 'owned' && <OwnedElections />}
      {tab === 'votes' && <VotedElections />}
      {tab === 'learn' && <LearnContent />}
    </Stack>
  )
}

function isTab(value: string | null): value is Tab {
  return value === 'owned' || value === 'votes' || value === 'learn'
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
        '-mb-px border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors',
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

function OwnedElections() {
  const { data, isPending, isError } = useOwnedElections()

  if (isPending) return <ListSpinner />
  if (isError) {
    return (
      <Muted role="alert">Could not load your elections. Please try again.</Muted>
    )
  }
  if (data.length === 0) {
    return <Muted>No elections yet. Create one!</Muted>
  }
  return (
    <Stack gap={3}>
      {data.map((e) => (
        <ElectionCard key={e.id} election={e} deletable />
      ))}
    </Stack>
  )
}

function VotedElections() {
  const pending = usePendingInvitations()
  const voted = useVotedElections()

  if (pending.isPending && voted.isPending) return <ListSpinner />

  const pendingList = pending.data ?? []
  const votedList = voted.data ?? []

  if (pendingList.length === 0 && votedList.length === 0) {
    if (pending.isError && voted.isError) {
      return (
        <Muted role="alert">Could not load your votes. Please try again.</Muted>
      )
    }
    return <Muted>Elections you vote in will appear here.</Muted>
  }

  return (
    <Stack gap={6}>
      {pendingList.length > 0 && (
        <section>
          <H2 className="mb-2 text-base">Pending Invitations</H2>
          <Stack gap={3}>
            {pendingList.map((e) => (
              <ElectionCard key={e.id} election={e} />
            ))}
          </Stack>
        </section>
      )}
      {votedList.length > 0 && (
        <section>
          {pendingList.length > 0 && <H2 className="mb-2 text-base">Voted</H2>}
          <Stack gap={3}>
            {votedList.map((e) => (
              <ElectionCard key={e.id} election={e} />
            ))}
          </Stack>
        </section>
      )}
    </Stack>
  )
}

function ListSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

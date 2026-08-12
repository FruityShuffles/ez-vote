import {
  Link,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
} from 'react-router-dom'

import type { RouteHandle } from '@/components/AppLayout'
import { useElection } from '@/lib/elections'

export function Breadcrumbs() {
  const matches = useMatches()
  const crumbMatches = matches.filter(
    (match) => (match.handle as RouteHandle | undefined)?.crumb != null,
  )
  if (crumbMatches.length === 0) return null

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {crumbMatches.map((match, index) => {
          const crumb = (match.handle as RouteHandle).crumb!
          const current = index === crumbMatches.length - 1
          if (typeof crumb === 'string') {
            return (
              <li key={match.id} className="flex items-center gap-2">
                <span aria-hidden>/</span>
                {current ? (
                  <span aria-current="page" className="text-foreground">
                    {crumb}
                  </span>
                ) : (
                  <Link
                    to={match.pathname}
                    className="hover:text-foreground hover:underline"
                  >
                    {crumb}
                  </Link>
                )}
              </li>
            )
          }
          const Crumb = crumb
          return <Crumb key={match.id} current={current} />
        })}
      </ol>
    </nav>
  )
}

export function ElectionCrumb({ current }: { current: boolean }) {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const election = useElection(id)

  if (election.isPending) {
    return (
      <li className="flex items-center gap-2" aria-label="Loading election title">
        <span className="h-4 w-24 animate-pulse rounded bg-muted" />
      </li>
    )
  }

  const title = election.data?.title ?? 'Election'
  const isCaseStudy = election.data?.showcase === true
  const publicBallot = location.pathname.includes('/ballot/')
  const electionTarget = publicBallot
    ? `/election/${id}?voters=open`
    : `/election/${id}`

  return (
    <>
      <li>
        <Link
          to={
            isCaseStudy
              ? '/dashboard?tab=case-studies'
              : '/dashboard?tab=elections'
          }
          className="hover:text-foreground hover:underline"
        >
          {isCaseStudy ? 'Case Studies' : 'My Elections'}
        </Link>
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden>/</span>
        {current ? (
          <span aria-current="page" className="text-foreground">
            {title}
          </span>
        ) : (
          <Link
            to={electionTarget}
            replace={publicBallot && location.state?.from !== 'voters'}
            onClick={(event) => {
              if (location.state?.from !== 'voters') return
              event.preventDefault()
              navigate(-1)
            }}
            className="hover:text-foreground hover:underline"
          >
            {title}
          </Link>
        )}
      </li>
    </>
  )
}

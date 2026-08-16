import { CheckCircle2, ListOrdered, Star, User, Vote } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { RESULT_ALGORITHM_ORDER } from '@/lib/results'
import { cn } from '@/lib/utils'

// The voting methods an election was run under, as icon+label chips. Shared by
// the election detail surface and the dashboard tables (#147) so a method reads
// the same wherever it appears.
//
// `include_fptp` is appended as an ordinary chip, styled identically to the
// methods voters cast under. It is a comparison baseline rather than a ballot
// method, but the distinction belongs on the results surface, not in a chip
// hierarchy nobody can decode at a glance.

const ALGORITHM_META: Record<
  string,
  { label: string; Icon: typeof CheckCircle2 }
> = {
  approval: { label: 'Approval', Icon: CheckCircle2 },
  irv: { label: 'IRV', Icon: ListOrdered },
  star: { label: 'STAR', Icon: Star },
  fptp: { label: 'FPTP', Icon: User },
}

/** Canonical display order (RES-01): Approval → IRV → STAR → FPTP, others last. */
function rank(algorithm: string): number {
  const i = RESULT_ALGORITHM_ORDER.indexOf(
    algorithm as (typeof RESULT_ALGORITHM_ORDER)[number],
  )
  return i < 0 ? 999 : i
}

export function AlgorithmBadges({
  algorithms,
  includeFptp = false,
  className,
}: {
  algorithms: string[]
  includeFptp?: boolean
  className?: string
}) {
  const all = includeFptp && !algorithms.includes('fptp')
    ? [...algorithms, 'fptp']
    : algorithms
  const ordered = [...all].sort((a, b) => rank(a) - rank(b))

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {ordered.map((algo) => {
        const { label, Icon } = ALGORITHM_META[algo] ?? {
          label: algo,
          Icon: Vote,
        }
        return (
          <Badge key={algo} variant="secondary" className="gap-1">
            <Icon className="size-3" aria-hidden />
            {label}
          </Badge>
        )
      })}
    </div>
  )
}

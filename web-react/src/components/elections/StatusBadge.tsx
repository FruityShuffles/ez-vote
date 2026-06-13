import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ElectionStatus } from '@/lib/elections'

// Status chip ported from Flutter `_StatusChip` (election_detail_screen.dart):
// grey draft, green open, red closed, label uppercased. Colors are explicit
// rather than Badge variants because the green has no design-token slot yet and
// cutover parity wants the same three-state palette as the Flutter app.
const STATUS_STYLES: Record<ElectionStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-destructive/10 text-destructive',
}

export function StatusBadge({
  status,
  className,
}: {
  status: ElectionStatus
  className?: string
}) {
  return (
    <Badge className={cn('font-semibold', STATUS_STYLES[status], className)}>
      {status.toUpperCase()}
    </Badge>
  )
}

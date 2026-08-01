import { AppShell } from '@/components/ui/app-shell'
import { cn } from '@/lib/utils'

export function CenteredState({
  children,
  width = 'md',
  className,
}: {
  children: React.ReactNode
  width?: React.ComponentProps<typeof AppShell>['width']
  className?: string
}) {
  return (
    <AppShell width={width}>
      <div className={cn('flex justify-center py-20', className)}>
        {children}
      </div>
    </AppShell>
  )
}

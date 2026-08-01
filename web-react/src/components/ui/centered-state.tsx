import { cn } from '@/lib/utils'

export function CenteredState({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex justify-center py-20', className)}>
      {children}
    </div>
  )
}

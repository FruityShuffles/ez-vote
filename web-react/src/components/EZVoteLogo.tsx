import { cn } from '@/lib/utils'

// EZVote brand mark: a ballot card with a check, drawn in currentColor so it
// inherits text color and themes with the indigo tokens. Resolves the logo-asset
// gap carried over from Flutter (parity-checklist visual items #17/#20); the
// favicon (public/favicon.svg) uses the same motif.
export function EZVoteMark({
  className,
  ...props
}: React.ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-6', className)}
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  )
}

// Mark + wordmark lockup, for the app header and auth cards. Decorative by
// default (the surrounding link/heading carries the accessible name); pass a
// `title` only when this is the sole label for its context.
export function EZVoteLogo({
  className,
  markClassName,
  ...props
}: React.ComponentProps<'span'> & { markClassName?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-heading font-semibold',
        className,
      )}
      {...props}
    >
      <EZVoteMark className={cn('text-primary', markClassName)} />
      <span className="tracking-tight">EZVote</span>
    </span>
  )
}

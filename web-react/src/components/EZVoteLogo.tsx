import { cn } from '@/lib/utils'

// The frozen Flutter reference uses these raster marks throughout the app.
// Keeping the source artwork in public/ makes the React shell visually familiar
// while preserving the semantic labels on the surrounding heading or link.
export function EZVoteMark({
  className,
  ...props
}: Omit<React.ComponentProps<'img'>, 'alt' | 'src'>) {
  return (
    <img
      src="/ezvote-logo-small.png"
      alt=""
      aria-hidden="true"
      className={cn('size-6 object-contain', className)}
      {...props}
    />
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
      <EZVoteMark className={markClassName} />
      <span className="tracking-tight">EZVote</span>
    </span>
  )
}

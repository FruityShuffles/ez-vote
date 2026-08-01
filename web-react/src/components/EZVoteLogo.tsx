import { cn } from '@/lib/utils'

// The product's raster marks, used throughout the app. The source artwork lives
// in public/; the semantic label stays on the surrounding heading or link so the
// image itself can be decorative.
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

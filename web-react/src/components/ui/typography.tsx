import { cn } from '@/lib/utils'

// Token-driven typography primitives. They exist so headings and body copy stop
// being ad-hoc `text-2xl font-semibold` strings scattered across surfaces — a
// source of the header-emphasis drift carried over from Flutter (parity item #7).
// Each renders the correct semantic element by default; override with `className`
// for one-off spacing, never for size/weight (change the primitive instead).

export function H1({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      className={cn(
        'font-heading text-3xl font-semibold tracking-tight text-balance',
        className,
      )}
      {...props}
    />
  )
}

export function H2({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      className={cn(
        'font-heading text-2xl font-semibold tracking-tight',
        className,
      )}
      {...props}
    />
  )
}

export function H3({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      className={cn(
        'font-heading text-lg font-medium tracking-tight',
        className,
      )}
      {...props}
    />
  )
}

export function Lead({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('text-lg text-muted-foreground text-pretty', className)}
      {...props}
    />
  )
}

export function Prose({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('text-sm leading-relaxed text-pretty', className)}
      {...props}
    />
  )
}

export function Muted({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}

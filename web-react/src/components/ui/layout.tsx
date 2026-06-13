import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Layout primitives — the Flutter Scaffold body's padding/width discipline,
// expressed as composable wrappers so surfaces don't re-hand-roll max-widths and
// gaps (a source of the narrow-desktop layout drift, parity item #59).

const containerVariants = cva('mx-auto w-full px-4 sm:px-6', {
  variants: {
    width: {
      sm: 'max-w-2xl',
      md: 'max-w-4xl',
      lg: 'max-w-6xl',
      full: 'max-w-none',
    },
  },
  defaultVariants: { width: 'lg' },
})

export function Container({
  className,
  width,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof containerVariants>) {
  return (
    <div className={cn(containerVariants({ width }), className)} {...props} />
  )
}

const stackVariants = cva('flex', {
  variants: {
    direction: { col: 'flex-col', row: 'flex-row items-center' },
    gap: {
      1: 'gap-1',
      2: 'gap-2',
      3: 'gap-3',
      4: 'gap-4',
      6: 'gap-6',
      8: 'gap-8',
    },
  },
  defaultVariants: { direction: 'col', gap: 4 },
})

export function Stack({
  className,
  direction,
  gap,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof stackVariants>) {
  return (
    <div
      className={cn(stackVariants({ direction, gap }), className)}
      {...props}
    />
  )
}

import { Link } from 'react-router-dom'
import { CheckSquare, ListOrdered, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { H1, Lead } from '@/components/ui/typography'
import { useAuth } from '@/auth/context'
import { cn } from '@/lib/utils'

// Landing screen, ported from the frozen Flutter reference
// (lib/presentation/screens/landing_screen.dart). Public and unguarded: the CTA
// adapts to live auth state (Go to Dashboard when signed in, Get Started / Sign
// In otherwise), matching the Flutter landing.

const FEATURES: { icon: LucideIcon; text: string }[] = [
  {
    icon: CheckSquare,
    text: 'Approval Voting — vote for all candidates you support',
  },
  {
    icon: ListOrdered,
    text: 'Instant Runoff (IRV) — rank candidates by preference',
  },
  {
    icon: Star,
    text: 'STAR Voting — score candidates and pick the best pair',
  },
]

export function Home() {
  const { user } = useAuth()

  return (
    <main className="min-h-svh">
      <div className="mx-auto flex max-w-xl flex-col items-center px-8 py-16">
        <img
          src="/ezvote-logo-large.png"
          alt=""
          aria-hidden="true"
          className="size-[120px] object-contain"
        />
        <H1 className="mt-6 text-4xl font-bold">EZVote</H1>
        <Lead className="mt-3 text-center">
          Run fair, transparent elections with modern voting methods.
        </Lead>

        <ul className="mt-10 flex w-full flex-col gap-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-primary"
              />
              <span className="text-base">{text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex w-full flex-col gap-3">
          {user ? (
            <Link
              to="/dashboard"
              className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/signup"
                className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
              >
                Get Started
              </Link>
              <Link
                to="/login"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'w-full',
                )}
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        <nav className="mt-6 flex flex-col items-center gap-2">
          <Link
            to="/learn"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Learn about voting methods
          </Link>
          <Link
            to="/privacy"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            to="/tos"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>
        </nav>
      </div>
    </main>
  )
}

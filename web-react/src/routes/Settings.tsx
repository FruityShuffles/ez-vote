import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { AppShell } from '@/components/ui/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { H1 } from '@/components/ui/typography'
import { Stack } from '@/components/ui/layout'
import { cn } from '@/lib/utils'
import { deleteAccount, signOut } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'

// Settings surface (M14), ported from Flutter `SettingsScreen`. Two cards: Legal
// (Privacy / Terms links) and Account (the delete-account flow). Display-name
// editing is intentionally absent — the frozen Flutter reference has none, and
// the migration adds no features (Overview.md non-goals).

export function Settings() {
  return (
    <AppShell width="md">
      <Stack gap={6}>
        <H1>Settings</H1>

        <section>
          <SectionLabel>Legal</SectionLabel>
          <Card className="py-0">
            <LinkRow to="/privacy" label="Privacy Policy" />
            <Separator />
            <LinkRow to="/tos" label="Terms of Service" />
          </Card>
        </section>

        <section>
          <SectionLabel>Account</SectionLabel>
          <Card className="py-0">
            <DeleteAccountRow />
          </Card>
        </section>
      </Stack>
    </AppShell>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-sm font-medium text-primary">{children}</p>
  )
}

function LinkRow({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center justify-between px-4 py-3 text-sm outline-none transition-colors',
        'hover:bg-muted/40 focus-visible:bg-muted/40',
        'first:rounded-t-xl last:rounded-b-xl',
      )}
    >
      <span>{label}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  )
}

function DeleteAccountRow() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteAccount()
      await signOut() // AuthProvider clears the query cache on the id → null change
      setOpen(false)
      navigate('/login')
    } catch (e) {
      toast.error(friendlyError(e, 'Error deleting account. Please try again.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-destructive outline-none transition-colors',
          'hover:bg-destructive/10 focus-visible:bg-destructive/10',
        )}
      >
        <Trash2 className="size-4" />
        <span>Delete Account</span>
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription>
            This will permanently delete your account, all elections you own, and
            all of your votes in elections that are still open. This action cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => void confirmDelete()}
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

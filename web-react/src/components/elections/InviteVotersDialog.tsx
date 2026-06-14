import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Link, QrCode, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Muted } from '@/components/ui/typography'
import {
  useAddVoterToElection,
  usePriorCovoters,
  type Covoter,
} from '@/lib/elections'
import { friendlyError } from '@/lib/errors'

// Invite Voters sheet ported from the Flutter `_InviteSheet`
// (lib/presentation/screens/election_detail_screen.dart). Two ways to share a
// join link — copy and QR — plus an "add from prior elections" picker. The
// underlying RPCs are unchanged (M12 is a client rewrite). The live
// refresh-as-people-vote behavior (INV-02/03) is M15; here, adding a voter
// invalidates the pending-invitees list at add time (the #84 wiring).

/** `<origin>/election/<id>/join` — the deep link that routes to JoinElection. */
function joinUrlFor(electionId: string): string {
  return `${window.location.origin}/election/${electionId}/join`
}

export function InviteVotersDialog({ electionId }: { electionId: string }) {
  const joinUrl = joinUrlFor(electionId)

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      toast.success('Join link copied!')
    } catch (e) {
      toast.error(friendlyError(e, 'Could not copy the link. Please try again.'))
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserPlus aria-hidden />
            Invite Voters
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Voters</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void copyJoinLink()}
          >
            <Link aria-hidden />
            Copy Join Link
          </Button>
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="outline">
                  <QrCode aria-hidden />
                  QR
                </Button>
              }
            />
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>Join QR Code</DialogTitle>
              </DialogHeader>
              <div className="flex justify-center p-2">
                <QRCodeSVG value={joinUrl} size={240} />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Separator />

        <PriorCovoters electionId={electionId} />
      </DialogContent>
    </Dialog>
  )
}

/** The "Add from prior elections" search + list. */
function PriorCovoters({ electionId }: { electionId: string }) {
  const [query, setQuery] = useState('')
  const { data, isPending, isError } = usePriorCovoters(electionId)

  const normalized = query.trim().toLowerCase()
  const covoters = data ?? []
  const filtered =
    normalized === ''
      ? covoters
      : covoters.filter((c) => c.display_name.toLowerCase().includes(normalized))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Add from prior elections</p>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name..."
          aria-label="Search prior co-voters by name"
          className="pl-7.5"
        />
      </div>

      {isPending ? (
        <div className="flex justify-center py-4">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : isError ? (
        <Muted role="alert" className="py-2">
          Could not load voters. Please try again.
        </Muted>
      ) : filtered.length === 0 ? (
        <Muted className="py-2">
          {normalized === ''
            ? 'No prior co-voters to add.'
            : `No matches for "${query.trim()}".`}
        </Muted>
      ) : (
        <ul className="max-h-75 divide-y divide-border overflow-y-auto">
          {filtered.map((c) => (
            <CovoterRow key={c.user_id} covoter={c} electionId={electionId} />
          ))}
        </ul>
      )}
    </div>
  )
}

function CovoterRow({
  covoter,
  electionId,
}: {
  covoter: Covoter
  electionId: string
}) {
  const [added, setAdded] = useState(false)
  const addVoter = useAddVoterToElection(electionId)

  async function add() {
    try {
      await addVoter.mutateAsync(covoter.user_id)
      // Transient ✓ until the prior-covoters refetch drops this row (INV-01).
      setAdded(true)
    } catch (e) {
      toast.error(friendlyError(e, 'Error adding voter. Please try again.'))
    }
  }

  const n = covoter.election_count

  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">{covoter.display_name}</p>
        <Muted className="text-xs">
          Voted with you in {n} election{n === 1 ? '' : 's'}
        </Muted>
      </div>
      {addVoter.isPending ? (
        <Spinner className="size-4 text-muted-foreground" />
      ) : added ? (
        <Check className="size-4 text-green-600" aria-label="Added" />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => void add()}>
          Add
        </Button>
      )}
    </li>
  )
}

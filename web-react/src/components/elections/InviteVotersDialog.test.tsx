import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InviteVotersDialog } from '@/components/elections/InviteVotersDialog'
import type { Covoter } from '@/lib/elections'

const mocks = vi.hoisted(() => ({
  covoters: [] as Covoter[],
  priorPending: false,
  priorError: false,
  addVoter: vi.fn<(id: string) => Promise<void>>(),
  writeText: vi.fn<(text: string) => Promise<void>>(),
}))

vi.mock('@/lib/elections', () => ({
  usePriorCovoters: () => ({
    data: mocks.covoters,
    isPending: mocks.priorPending,
    isError: mocks.priorError,
  }),
  useAddVoterToElection: () => ({
    mutateAsync: mocks.addVoter,
    isPending: false,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'

function covoter(over: Partial<Covoter> = {}): Covoter {
  return {
    user_id: 'u1',
    display_name: 'Alice',
    election_count: 2,
    ...over,
  }
}

beforeEach(() => {
  mocks.covoters = []
  mocks.priorPending = false
  mocks.priorError = false
  mocks.addVoter.mockReset().mockResolvedValue(undefined)
  mocks.writeText.mockReset().mockResolvedValue(undefined)
  vi.clearAllMocks()
})

async function openSheet() {
  const user = userEvent.setup()
  // `userEvent.setup()` installs its own clipboard stub, so override it *after*
  // setup with the spy we assert on (jsdom's `clipboard` is getter-only).
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeText },
  })
  render(<InviteVotersDialog electionId="e1" />)
  await user.click(screen.getByRole('button', { name: /Invite Voters/ }))
  // Dialog content (the search field) is now mounted.
  await screen.findByLabelText(/Search prior co-voters/)
  return user
}

describe('INV-05 — copy link & QR', () => {
  it('copies the join URL and toasts on success', async () => {
    const user = await openSheet()
    await user.click(screen.getByRole('button', { name: /Copy Join Link/ }))

    expect(mocks.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/election/e1/join`,
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Join link copied!'),
    )
  })

  it('shows a QR code for the join link', async () => {
    const user = await openSheet()
    await user.click(screen.getByRole('button', { name: /^QR$/ }))
    const qrDialog = await screen.findByText('Join QR Code')
    // qrcode.react renders an <svg>.
    expect(
      qrDialog.closest('[data-slot="dialog-content"]')?.querySelector('svg'),
    ).toBeInTheDocument()
  })
})

describe('add from prior elections', () => {
  it('filters the list by the search query (case-insensitive)', async () => {
    mocks.covoters = [
      covoter({ user_id: 'u1', display_name: 'Alice' }),
      covoter({ user_id: 'u2', display_name: 'Bob' }),
    ]
    const user = await openSheet()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/Search prior co-voters/), 'ali')
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('adds a co-voter and shows the ✓ confirmation', async () => {
    mocks.covoters = [covoter({ user_id: 'u1', display_name: 'Alice' })]
    const user = await openSheet()
    const row = screen.getByText('Alice').closest('li') as HTMLElement

    await user.click(within(row).getByRole('button', { name: 'Add' }))

    expect(mocks.addVoter).toHaveBeenCalledWith('u1')
    await waitFor(() =>
      expect(within(row).getByLabelText('Added')).toBeInTheDocument(),
    )
    expect(within(row).queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  it('toasts a friendly error when the add fails', async () => {
    mocks.covoters = [covoter({ user_id: 'u1', display_name: 'Alice' })]
    mocks.addVoter.mockRejectedValueOnce(new Error('boom'))
    const user = await openSheet()
    const row = screen.getByText('Alice').closest('li') as HTMLElement

    await user.click(within(row).getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Error adding voter. Please try again.',
      ),
    )
  })

  it('shows the empty-state copy when there are no prior co-voters', async () => {
    mocks.covoters = []
    await openSheet()
    expect(screen.getByText('No prior co-voters to add.')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { AuthCard } from '@/components/AuthCard'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// Wiring/a11y tests for the M7 shared components. Base UI guarantees the
// primitive-level accessibility; these assert *our* composition of it — label
// association, error semantics, keyboard operability, and disabled handling —
// so a future edit can't silently regress it.

describe('Field', () => {
  it('associates the label with its input so clicking the label focuses it', async () => {
    const user = userEvent.setup()
    render(
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(input).toBeInTheDocument()
    await user.click(screen.getByText('Email'))
    expect(input).toHaveFocus()
  })

  it('renders validation errors as an alert', () => {
    render(<FieldError>Enter a valid email address.</FieldError>)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid email address.',
    )
  })
})

describe('Switch', () => {
  it('toggles with the keyboard', async () => {
    const user = userEvent.setup()
    render(<Switch aria-label="Public ballots" />)
    const sw = screen.getByRole('switch')
    expect(sw).not.toBeChecked()
    sw.focus()
    await user.keyboard(' ')
    expect(sw).toBeChecked()
  })
})

describe('Checkbox', () => {
  it('toggles with the keyboard', async () => {
    const user = userEvent.setup()
    render(<Checkbox aria-label="Include FPTP" />)
    const box = screen.getByRole('checkbox')
    expect(box).not.toBeChecked()
    box.focus()
    await user.keyboard(' ')
    expect(box).toBeChecked()
  })
})

describe('Button', () => {
  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup()
    let clicks = 0
    render(
      <Button disabled onClick={() => (clicks += 1)}>
        Save
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(clicks).toBe(0)
  })
})

describe('AuthCard', () => {
  it('renders its title as the page-level h1', () => {
    render(
      <AuthCard title="Sign in" subtitle="Sign in to continue">
        <button>Submit</button>
      </AuthCard>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeInTheDocument()
  })
})

describe('Dialog', () => {
  it('opens from its trigger and closes on Escape, restoring focus to the trigger', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger render={<Button>Open</Button>} />
        <DialogContent>
          <DialogTitle>Confirm</DialogTitle>
          <DialogClose render={<Button>Done</Button>} />
        </DialogContent>
      </Dialog>,
    )

    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

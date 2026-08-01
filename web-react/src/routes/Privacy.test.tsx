import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom'
import { Privacy } from '@/routes/Privacy'
import { Settings } from '@/routes/Settings'

describe('Privacy', () => {
  it('renders the title, a known section, and the contact email', () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'Privacy Policy', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Data Retention' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/contact@ez-vote\.org/).length).toBeGreaterThan(0)
  })

  it('returns to Settings when opened from its legal links', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [
        { path: '/settings', element: <Settings /> },
        { path: '/privacy', element: <Privacy /> },
        { path: '/', element: <div>Public home</div> },
      ],
      { initialEntries: ['/settings'] },
    )
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('link', { name: 'Privacy Policy' }))
    expect(
      await screen.findByRole('link', { name: '← Back to settings' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '← Back to settings' }))

    expect(
      await screen.findByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument()
  })

  it('returns a direct privacy visit to the public home', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [
        { path: '/privacy', element: <Privacy /> },
        { path: '/', element: <div>Public home</div> },
      ],
      { initialEntries: ['/privacy'] },
    )
    render(<RouterProvider router={router} />)

    await user.click(screen.getByRole('link', { name: '← Back to home' }))

    expect(await screen.findByText('Public home')).toBeInTheDocument()
  })
})

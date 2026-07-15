# EZVote

EZVote is a web application for creating, running, and reviewing elections with multiple voting methods. It is a client-rendered React application backed by Supabase.

## What it does

- Create and manage elections with Approval, Instant-Runoff Voting (IRV), STAR Voting, and optional First-Past-the-Post (FPTP) results.
- Support seven ballot formats selected from the election's voting-method combination.
- Invite voters by email, shareable link, or QR code.
- Let voters submit, edit, and review ballots while an election is open.
- Show method-by-method results when an election closes, with an optional live-results mode.
- Support voter-proposed candidates when an election owner enables that option.

## Stack

- React 19 + TypeScript
- Vite + React Router
- Supabase (authentication, database, and edge functions)
- TanStack Query for server state and Zustand for ballot state
- Tailwind CSS and Base UI-based owned components
- Vitest, Testing Library, and Playwright

## Development and documentation

Local setup, tests, and deployment are documented in the [React app guide](web-react/README.md).

For the technical details behind the product, see:

- [React tech-stack decisions](docs/Migration/Tech%20Stack.md)
- [Design system](docs/Migration/Design%20System.md)
- [Database schema](docs/Backend/Schema.md)
- [Result-computation edge function](docs/Backend/Edge%20Function.md)
- [Playwright QA reference](docs/Playwright-QA-Reference.md)

## License

A license has not yet been selected. Until one is added, the project is not offered for reuse, modification, or distribution.

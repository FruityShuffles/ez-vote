# Cutover Plan (M17–M19)

> **Status: M19 complete.** `ez-vote.org` is bound to the React Cloudflare Pages project
> `ez-vote-react` and serves the production app. The legacy Flutter Pages project `ez-vote`
> has no custom domains and is retained only for the short rollback window. The sections
> recording M17/M18 below are historical verification evidence; the current release topology
> and rollback procedure are in §2 and §6.

The verification gate between "the React app is built" and "the React app is the
production stack." M17 produces this protocol and a deployed, config-ready staging app;
**M18** executes the protocol and signs off the [[Migration/Parity Checklist]]; **M19**
flipped `ez-vote.org` to React once the exit criteria were met. This is a *verification*
deployment, not a traffic split — the site has no active user traffic ([[Migration/Overview]]
§29), so the discipline below is about correctness, not rollout safety.

## How to use this

- §2 records the current production topology and release path.
- §3 defines the historical verification tracks; §4 is the concrete list of test elections
  that fed Track C; §5 is the completed pass/fail gate.
- Exit criteria are **checklist-based, not time-based** ([[Migration/Overview]] §107, §128):
  the gate is "every parity-checklist box accounted for," never "N weeks without a defect."
- M18 records sign-off by checking boxes in [[Migration/Parity Checklist]] and filling the
  sign-off line in §5.

---

## 1. Relationship to other docs

- [[Migration/Overview]] — the phased plan; this doc is the Phase-3 "M17" step.
- [[Migration/Parity Checklist]] — the per-behavior test plan. Track C (§3) walks it; the
  exit criteria (§5) are defined in terms of its boxes.
- [[Migration/Tech Stack]] — why the React app is a static Vite SPA on Cloudflare Pages
  (Decision 1), which is what makes the deploy and rollback topology in §2/§6 simple.

---

## 2. Current production deployment topology

**React app — Cloudflare Pages project `ez-vote-react`** (production branch `main`).
Build = static Vite output (`web-react/dist/`), deployed by direct upload with `wrangler`.
Its single production deployment serves these aliases:

- `https://ez-vote.org` — primary public URL
- `https://next.ez-vote.org` — verification alias
- `https://ez-vote-react.pages.dev` — Pages alias

These URLs are aliases of the same deployment, not isolated staging environments.

> **Deploy gotcha (from the runbook):** `wrangler pages deploy` infers the branch from the
> current git branch; pass `--branch main` to publish to **production** regardless of the
> checked-out branch, or the bare `ez-vote-react.pages.dev` URL 404s with "Deployment Not
> Found." Don't duplicate the runbook here — follow it.

**Custom-domain bindings:**

1. `ez-vote.org` and `next.ez-vote.org` are bound to `ez-vote-react`.
2. The legacy Flutter project `ez-vote` has no custom domains.
3. Verify `https://ez-vote.org` and a direct SPA deep link resolve (the
   `public/_redirects` `/* /index.html 200` rule).

**Backend — shared, not forked.** The production React app points at the same Supabase
project that Flutter used; `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are injected at
build time. There is no schema fork, so a rollback remains data-migration-free.

**Pre-flight auth config (blocks AUTH-01/02/03 on the staging origin** — from
[[Migration/Tech Stack]] M6 note):

- [x] Add `https://next.ez-vote.org` and `https://ez-vote.org` to Supabase Auth's
      **redirect allow-list**.
- [x] Confirm Google OAuth's Supabase callback configuration permits the staging flow.
- [x] Re-check Supabase auth **email-template links** (confirm/recovery) resolve to the
      staging origin during verification and the production origin after M19.

---

## 3. Verification protocol

Three independent tracks. A and B are machine-run (and largely already green in CI); C is
the manual side-by-side that discharges the bulk of the parity checklist.

### Track A — Golden corpus (shared algorithm core, machine-guarded)

Run in `supabase/functions/`:

```
deno task test
```

Covers the tabulation invariants (Parity Checklist §1, 17 synthetic fixtures in
`_shared/fixtures/synthetic/`) and the client-side derivation rules (§4 ⟐, 40 fixtures in
`_shared/fixtures/derivation/`). CI: `.github/workflows/tabulate-tests.yml`. Because both
clients call the shared `_shared/tabulate.ts` and the React port consumes `@shared/derive`,
a green corpus guarantees the algorithm core is identical across stacks. **Prerequisite, not
the whole gate** — it proves the math, not the rendering.

### Track B — React automated suite

Run in `web-react/`:

```
npm run test:run     # 13 Vitest files (component + lib parity assertions)
npm run typecheck
npm run lint
npm run build        # tsc -b && vite build — must produce a clean dist/
```

CI: `.github/workflows/web-react-ci.yml`. These lock the unit/component-level parity
assertions already cited per-row in the checklist (e.g. `ResultsView.test.tsx` for RES-*,
`BallotView.test.tsx` for BAL-*, `useElectionRealtime.test.ts` for RTM-*).

### Track C — Side-by-side manual parity

For each test election in §4, perform the **same flow** in the deployed React app
(`https://next.ez-vote.org`) and the live Flutter app (`https://ez-vote.org`), and diff the
observable outcome — **behavior, not mechanism** ([[Migration/Parity Checklist]] "How to use
this"):

- `result_data` rendered **shape**, field-by-field, per algorithm (not just winners).
- Ballot payloads written to the DB (inspect the `ballots` row).
- Invitee / submitted-voter list state and its live refresh.
- Realtime propagation across two concurrent clients.
- The election-analysis card insights.

This is where the unchecked 🔴/🟡 boxes in the checklist get verified and ticked. Record any
**accepted divergence** in the checklist row itself (the BAL-03 tie-break-restore divergence
is the template — a documented, intentional difference is a pass, not a regression).

---

## 4. Test-election matrix

The structured elections to create and run end-to-end in Track C. Each row lists the parity
IDs it primarily discharges (full coverage is the union across rows).

| # | Election | Setup | Discharges |
|---|----------|-------|------------|
| 1 | **Template A** | IRV only | BAL-01/03/15, DET-01, RES-01/02 |
| 2 | **Template B** | STAR only; run once FPTP-off, once FPTP-on | BAL-01/07, BAL-06, TAB-04/05 |
| 3 | **Template C** | Approval only; FPTP-off and FPTP-on | BAL-01/06/12, TAB-01 |
| 4 | **Template D** | IRV + Approval | BAL-02/08/15 (top-K derivation) |
| 5 | **Template E** | STAR + Approval; FPTP-off and FPTP-on | BAL-02/06/07 (cutoff derivation) |
| 6 | **Template F** | STAR + IRV | BAL-02/03/04/05 (score→rank + manual tie-break) |
| 7 | **Template G** | STAR + IRV + Approval | BAL-02/03/04, full derivation chain |
| 8 | **Multi-algorithm** | several algorithms + `include_fptp` entered **out of order** | RES-01 (canonical Approval→IRV→STAR→FPTP order), RES-04, ANL-01 |
| 9 | **Tie scenarios** | reproduce fixtures `approval-tie`, `irv-multi-elimination-tie`, `star-three-way-score-tie`, `fptp-tie` via real ballots | TAB-01..04, RES-03 |
| 10 | **Edit-after-change** | vote → owner adds **and** removes a candidate → voter edits | BAL-08/09/10/11, DET-06, DET-07, BAL-14 |
| 11 | **Realtime, 2 clients** | client B watches results/voters/pending while client A submits **and** edits | RTM-01..06, INV-02/03, RES-06 |
| 12 | **Invite + join + auth** | invite via link + QR; join through a forced signup; add a prior co-voter | INV-01/04/05, AUTH-01 |
| 13 | **Account & info** | delete account; hit `/`, `/learn`, `/privacy`, `/tos` while logged out | SET-01, AUTH-03 (recovery) |
| 14 | **Public ballots** | enable `public_ballots`; view + page ballots; confirm gate blocks when off | PUB-01, CRT-03/04 |

Templates A–G algorithm combos are per [[Architecture/Ballot Templates]]
(A=IRV, B=STAR, C=Approval, D=IRV+Approval, E=STAR+Approval, F=STAR+IRV, G=STAR+IRV+Approval;
FPTP is an additive flag on B/C/E, never a template selector).

---

## 5. Exit criteria (the cutover gate)

All of the following must hold before M19 flips DNS:

- [x] **Track A** — golden corpus 100% green in CI (`tabulate-tests.yml`).
- [x] **Track B** — React CI green: `test:run`, `typecheck`, `lint`, and `build` all pass
      (`web-react-ci.yml`).
- [x] **Track C** — in [[Migration/Parity Checklist]], **every 🔴 box is checked**, and every
      🟡 box is either checked or carries a recorded, accepted divergence. No surface is
      signed off with an unchecked 🔴 (per the checklist's own §144 acceptance rule).
- [x] **Pre-flight auth config** (§2) confirmed on the `next.ez-vote.org` origin.
- [x] **Deep links** resolve on the staging SPA (no 404 on direct `/election/:id` loads).

**Sign-off** (filled by M18):

```
Verified by: project maintainer   Date: 2026-07-15   Staging build SHA: 03b76ed
```

### M18 execution record — 2026-07-14

- **Track A:** `deno task test` passed all 57 tabulation and derivation fixtures.
- **Track B:** `npm run test:run` passed 177 tests in 21 files; `typecheck`, `lint`,
  and `build` passed.
- **Deployed staging smoke/E2E (historical, before M19):** 10 Playwright tests passed against
  `https://ez-vote-react.pages.dev`: public SPA deep links, authenticated sessions,
  election creation, ballot submission, invite/join across two users, close/compute,
  and results rendering.
- **Expanded M18 E2E:** the full Playwright suite later passed 13 tests, adding
  Approval/STAR FPTP-eligibility coverage and the pre-submit candidate gate.
- **Visual review:** the public landing flow and text match the Flutter reference. The
  review found that React used a generic checkmark in place of the established logo;
  the corrected branding was deployed to the `ez-vote-react` production branch and
  its public smoke suite passed again.
- **Manual candidate gate:** the pre-submit warning toast was confirmed in production.
- **Deployed reranking review:** on the current Cloudflare Pages deployment, a
  STAR + IRV ballot moved Bob from second to first when scored 5 and Cara from
  third to second when scored 4. The dnd-kit row transition was visibly smooth
  at desktop and 390px mobile widths (BAL-17).
- **Track C:** every parity-checklist row is now accounted for; no red or yellow
  row remains unchecked.

**M18 sign-off:** the project maintainer confirmed the `next.ez-vote.org`
domain, auth-provider, recovery-link, and deep-link checks on 2026-07-15.
GitHub Actions reported the latest React CI run for `03b76ed` and the latest
algorithm golden-test run as successful. All §5 conditions are satisfied;
M19 is unblocked.

### M19 execution record

- `ez-vote.org` was moved from the Flutter `ez-vote` Pages project to the React
  `ez-vote-react` Pages project.
- The project maintainer confirmed `https://ez-vote.org` serves the React app.
- Rollback tag `flutter-pre-react-cutover` points to the confirmed live Flutter commit
  `55bc667a2b935e7c816a76f7a85de5da0b985b5a`.
- The Flutter Pages project retains its build pipeline but has no custom domains.

---

## 6. Rollback procedure

Flutter remains deployable for a short window — **days, not weeks**
([[Migration/Overview]] §109). Because both stacks share one Supabase backend, rollback is a
Cloudflare custom-domain change with **no data migration**:

- The Flutter Pages project `ez-vote` has no custom domains but keeps its build pipeline
  intact. Its source rollback point is `flutter-pre-react-cutover` at `55bc667`.
- Rollback = move the `ez-vote.org` custom-domain binding back to `ez-vote`; React remains
  available at `next.ez-vote.org` for verification.
- Return the custom-domain binding to `ez-vote-react` after the rollback cause is resolved.
- Final Flutter **decommission is M22 (#108)** — explicitly deferred until after a
  post-cutover stability window, never bundled into the cutover itself.

---

## 7. M17/M18 handoff (historical)

M17 delivers: this protocol, plus a `next.ez-vote.org` staging deployment with auth config
in place. **M18 (#104)** executes Track C against the §4 matrix, diffs each flow against
Flutter, ticks the [[Migration/Parity Checklist]] boxes, and records the §5 sign-off. M19
(#105) is unblocked only when every §5 criterion is met.

---

## Appendix A — Operator runbook (production releases & configuration)

The exact steps for a production release, split by what is automatable (CI or a maintainer
with `wrangler` + the build `.env`) versus what requires a dashboard. Run shell commands
from `web-react/`.

### A.1 — Automatable: build & production deploy

Prereqs: `web-react/.env` holds the production `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY`; `wrangler` is authenticated to the account owning the
`ez-vote.org` zone (`npx.cmd wrangler whoami`). The `.cmd` command form is required in this
Windows PowerShell environment; use the ordinary `npm` / `npx` form in other shells.

```
git switch main
git pull --ff-only
git status --short      # must be empty
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd run build       # tsc -b && vite build  →  dist/  (Supabase values inlined here)
npx.cmd wrangler pages deploy dist --project-name ez-vote-react --branch main
```

> **`--branch main` is mandatory.** `wrangler` otherwise infers the branch from the checked-out
> git branch and publishes a *preview* deployment, leaving the bare `ez-vote-react.pages.dev`
> production URL on the old build (or 404 "Deployment Not Found").

Verify the production release (no dashboard needed):

```
curl -s -o /dev/null -w "%{http_code}\n" https://ez-vote.org/        # 200
curl -s -o /dev/null -w "%{http_code}\n" https://ez-vote.org/login  # 200 (SPA _redirects)
curl -s https://ez-vote.org/ | grep -o '/assets/index-[^"]*\.js'    # matches local build hash
```

The Pages aliases and both custom domains serve this same production deployment.

### A.2 — Dashboard-only: domain binding & auth configuration

These need credentials/scopes the build pipeline lacks (a `wrangler` OAuth/CI token is
typically `pages (write)` + `zone (read)` — no DNS-write — and there is no Supabase
management or Google Cloud token on hand, only the anon key). Perform once, by hand:

1. **Cloudflare domain audit** — `ez-vote-react` must own `ez-vote.org` and
   `next.ez-vote.org`; `ez-vote` must own neither. Same-account domains use proxied CNAME
   records and Cloudflare-managed certificates.
2. **Supabase redirect allow-list** — Supabase → Authentication → URL Configuration →
   Redirect URLs must include `https://ez-vote.org/**` and `https://next.ez-vote.org/**`
   (keep localhost entries).
3. **Google OAuth** — Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0
   client → confirm Authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`
   is present (project-level; usually already set from Flutter — just verify).
4. **Email-template links** — click a real confirm/recovery link from a test signup and
   confirm it resolves to `https://ez-vote.org`.

After any domain configuration change, confirm `https://ez-vote.org/` and a deep link both
return 200 (a new certificate may take a couple of minutes to go Active).

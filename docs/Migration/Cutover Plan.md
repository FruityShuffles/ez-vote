# Cutover Plan (M17)

The verification gate between "the React app is built" and "the React app is the
production stack." M17 produces this protocol and a deployed, config-ready staging app;
**M18** executes the protocol and signs off the [[Migration/Parity Checklist]]; **M19**
flips `ez-vote.org` to React once the exit criteria here are met. This is a *verification*
deployment, not a traffic split — the site has no active user traffic ([[Migration/Overview]]
§29), so the discipline below is about correctness, not rollout safety.

## How to use this

- §2 is a one-time setup the staging app must satisfy before verification starts.
- §3 defines the three verification tracks; §4 is the concrete list of test elections that
  feed Track C; §5 is the pass/fail gate.
- Exit criteria are **checklist-based, not time-based** ([[Migration/Overview]] §107, §128):
  the gate is "every parity-checklist box accounted for," never "N weeks without a defect."
- M18 records sign-off by checking boxes in [[Migration/Parity Checklist]] and filling the
  sign-off line in §5.

---

## 1. Relationship to other docs

- [[Migration/Overview]] — the phased plan; this doc is the Phase-3 "M17" step.
- [[Migration/Parity Checklist]] — the per-behavior test plan. Track C (§3) walks it; the
  exit criteria (§5) are defined in terms of its boxes.
- [[Migration/Tech Stack]] — why the staging app is a static Vite SPA on Cloudflare Pages
  (Decision 1), which is what makes the deploy and rollback topology in §2/§6 simple.

---

## 2. Staging deployment topology

**React app — Cloudflare Pages project `ez-vote-react`** (production branch `main`),
currently served at `https://ez-vote-react.pages.dev`. Build = static Vite output
(`web-react/dist/`), deployed direct-upload via `wrangler` (see the staging-deploy runbook
in project memory for the exact commands).

> **Deploy gotcha (from the runbook):** `wrangler pages deploy` infers the branch from the
> current git branch; pass `--branch main` to publish to **production** regardless of the
> checked-out branch, or the bare `ez-vote-react.pages.dev` URL 404s with "Deployment Not
> Found." Don't duplicate the runbook here — follow it.

**Friendly staging URL — adopt `next.ez-vote.org` (M17 owns this binding):**

1. Cloudflare Pages → `ez-vote-react` → **Custom domains** → add `next.ez-vote.org`.
2. DNS: `CNAME next` → `ez-vote-react.pages.dev` (proxied).
3. Verify `https://next.ez-vote.org` serves the latest production deployment and that SPA
   deep links resolve (the `public/_redirects` `/* /index.html 200` rule).

**Backend — shared, not forked.** The staging app points at the **same Supabase project**
as the live Flutter app; `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are injected at
build time (mirroring Flutter's `--dart-define`). No schema fork — both stacks read/write
one database, which is what makes side-by-side parity (Track C) meaningful and rollback (§6)
data-migration-free.

**Pre-flight auth config (blocks AUTH-01/02/03 on the staging origin** — from
[[Migration/Tech Stack]] M6 note):

- [ ] Add `https://next.ez-vote.org` to Supabase Auth's **redirect allow-list**.
- [ ] Add the same origin to the **Google OAuth console** authorized redirect URIs.
- [ ] Re-check Supabase auth **email-template links** (confirm/recovery) resolve to the
      staging origin during verification (and re-check again at the M19 cutover for prod).

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

- [ ] **Track A** — golden corpus 100% green in CI (`tabulate-tests.yml`).
- [ ] **Track B** — React CI green: `test:run`, `typecheck`, `lint`, and `build` all pass
      (`web-react-ci.yml`).
- [ ] **Track C** — in [[Migration/Parity Checklist]], **every 🔴 box is checked**, and every
      🟡 box is either checked or carries a recorded, accepted divergence. No surface is
      signed off with an unchecked 🔴 (per the checklist's own §144 acceptance rule).
- [ ] **Pre-flight auth config** (§2) confirmed on the `next.ez-vote.org` origin.
- [ ] **Deep links** resolve on the staging SPA (no 404 on direct `/election/:id` loads).

**Sign-off** (filled by M18):

```
Verified by: ____________   Date: __________   Staging build SHA: __________
```

---

## 6. Rollback procedure

The cutover (M19) keeps Flutter deployable for a short window — **days, not weeks**
([[Migration/Overview]] §109). Because both stacks share one Supabase backend, rollback is a
DNS/routing flip with **no data migration**:

- The Flutter Pages project (`ez-vote` → `ez-vote.org`) stays **live and untouched** through
  M17 and M18.
- Before M19, **tag the last good Flutter commit** and keep its Cloudflare build pipeline
  intact.
- Rollback = repoint `ez-vote.org` back to the Flutter Pages project (the React project keeps
  serving `next.ez-vote.org`).
- Final Flutter **decommission is M22 (#108)** — explicitly deferred until after a
  post-cutover stability window, never bundled into the cutover itself.

---

## 7. Handoff to M18

M17 delivers: this protocol, plus a `next.ez-vote.org` staging deployment with auth config
in place. **M18 (#104)** executes Track C against the §4 matrix, diffs each flow against
Flutter, ticks the [[Migration/Parity Checklist]] boxes, and records the §5 sign-off. M19
(#105) is unblocked only when every §5 criterion is met.

---

## Appendix A — Operator runbook (deploy & config)

The exact steps to stand up / refresh the staging app, split by what is automatable (CI or a
maintainer with `wrangler` + the build `.env`) versus what requires a dashboard. Run shell
commands from `web-react/`.

### A.1 — Automatable: build & deploy

Prereqs: `web-react/.env` holds the **same** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
as the Flutter app (root `.env`); `wrangler` authenticated to the account owning the
`ez-vote.org` zone (`npx wrangler whoami`).

```
npm ci                  # clean install (skip if node_modules current)
npm run build           # tsc -b && vite build  →  dist/  (Supabase creds inlined here)
npx wrangler pages deploy dist --project-name ez-vote-react --branch main --commit-dirty=true
```

> **`--branch main` is mandatory.** `wrangler` otherwise infers the branch from the checked-out
> git branch and publishes a *preview* deployment, leaving the bare `ez-vote-react.pages.dev`
> production URL on the old build (or 404 "Deployment Not Found").

Verify (no dashboard needed):

```
curl -s -o /dev/null -w "%{http_code}\n" https://ez-vote-react.pages.dev/        # 200
curl -s -o /dev/null -w "%{http_code}\n" https://ez-vote-react.pages.dev/login    # 200 (SPA _redirects)
curl -s https://ez-vote-react.pages.dev/ | grep -o '/assets/index-[^"]*\.js'      # matches local build hash
```

The app is usable for Track C on `ez-vote-react.pages.dev` immediately after this — the
friendly domain (A.2) is a convenience, not a blocker.

### A.2 — Dashboard-only: domain binding & auth config

These need credentials/scopes the build pipeline lacks (a `wrangler` OAuth/CI token is
typically `pages (write)` + `zone (read)` — no DNS-write — and there is no Supabase
management or Google Cloud token on hand, only the anon key). Perform once, by hand:

1. **Bind `next.ez-vote.org`** — Cloudflare → Workers & Pages → `ez-vote-react` → **Custom
   domains** → add `next.ez-vote.org`. Same-account zone, so Cloudflare auto-creates the
   `CNAME next → ez-vote-react.pages.dev` (proxied) and provisions the cert. If not
   auto-created, add it manually under **DNS → Records**.
2. **Supabase redirect allow-list** — Supabase → Authentication → URL Configuration →
   Redirect URLs → add `https://next.ez-vote.org/**` (keep existing Flutter/localhost entries).
3. **Google OAuth** — Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0
   client → confirm Authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`
   is present (project-level; usually already set from Flutter — just verify).
4. **Email-template links** — during Track C, click a real confirm/recovery link from a test
   signup and confirm it resolves to the staging origin (re-check for prod at M19).

After A.2, confirm `https://next.ez-vote.org/` and a deep link both return 200 (cert may take
a couple of minutes to go Active).

---
name: ux-review
description: >-
  Drive a real browser via the Playwright MCP server to interactively review the
  EZVote React app's UI against design heuristics, then document findings. Use
  this whenever the user wants a usability or design critique rather than a
  pass/fail test — e.g. "do a UX review of the create-election flow", "look at
  the ballot screen as a first-time user", "review the dashboard on mobile",
  "find usability problems in signup", "is this confusing for voters?", "check
  the results page for accessibility issues". Use this (not e2e-test) when the
  goal is qualitative feedback and a findings report, not assertions.
---

# UX review (Playwright MCP)

Interactively explore the app like a user — navigate, *look* at what renders,
react, and probe — then write up heuristic findings. This is observational, not
assertion-based: the judgement lives in you, looping, not in a fixed script.

## Before reviewing

1. **Read the shared setup reference**: `docs/Playwright-QA-Reference.md` (target
   env, accounts, auth, MCP config).
2. **Confirm scope lightly** — the flow(s) to review, viewport(s), and lens. Sensible
   defaults if unspecified: review **both mobile (~390×844) and desktop
   (~1280×900)** since this began as a Flutter mobile app, with a **balanced**
   lens (clarity, friction, consistency, accessibility). Don't over-interview;
   pick defaults and proceed. Canonical flows worth covering: voter (landing →
   join → ballot per method → results), organizer (signup → create → configure →
   invite → manage → close), each ballot type (approval / STAR / IRV), and the
   account/auth screens.
3. **Confirm the MCP browser is available.** The `mcp__playwright__browser_*`
   tools must be loaded. If they aren't, the server likely needs a
   restart/approval (see the reference) — say so rather than falling back
   silently.

## The review loop

For each screen/state:

1. **Navigate** (`browser_navigate`). Start signed-out at `/`, or sign in for
   authed screens (persistent MCP profile, or a saved `storageState`).
2. **Capture** both a `browser_take_screenshot` (to see pixels) and a
   `browser_snapshot` (the accessibility tree — labels, headings, roles, focus
   order). The snapshot is also what you act on.
3. **Evaluate** against these heuristics — Nielsen's 10, visual
   hierarchy/layout/responsiveness, copy & microcopy, accessibility (labels,
   heading order, focus order, contrast), and flow friction (step count, dead
   ends, unclear next actions).
4. **Probe ambiguous affordances.** If a control's purpose isn't obvious, act on
   it and observe the consequence — does the result match the expectation the
   control set? This is the advantage of a live browser over static mockups.
5. **Switch viewports** with `browser_resize` to catch layout issues that only
   appear at one width (e.g. a mobile column stretched across desktop).
6. For drag-and-drop UIs (IRV ranking, score reordering), use the vision mouse
   tools (`browser_mouse_*`) since element-targeted drag can be unreliable.

Be honest and calibrated: this is expert heuristic review by one synthetic
reviewer — a strong, cheap first pass that complements, not replaces, real user
testing. Flag uncertain items as "needs check" (e.g. compute exact WCAG contrast
ratios from the DOM CSS only when doing an accessibility pass).

## Recording findings

Write to a dated `docs/UX-Review-<YYYY-MM-DD>.md` (use today's date). One row per
finding, grouped by screen:

| Screen | Viewport | Finding | Heuristic | Severity | Suggested fix |
|--------|----------|---------|-----------|----------|---------------|

Severity: blocker / high / medium / low. Lead with a short summary of the biggest
themes, then the table. Offer to turn high-value findings into GitHub issues.
Commit the report only if the user asks.

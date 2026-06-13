# Design System (M7)

The shared component layer and design tokens for the React build, built in M7 of [[Migration/Overview]]. It exists so the surface ports (M8–M16) compose a consistent, accessible, Flutter-matching UI from owned primitives instead of re-styling per surface. Stack choices (Tailwind + shadcn/Base UI) are fixed by [[Migration/Tech Stack]]; this doc records what M7 built on top of them.

**Status:** Shipped.

## Design tokens

The colors are the **Material 3 `ColorScheme.fromSeed(Colors.indigo)`** palette — the exact scheme the frozen Flutter app renders (`lib/app.dart`: `colorSchemeSeed: Colors.indigo`, `useMaterial3: true`, `Brightness.light`) — mapped onto shadcn's semantic token names. Matching the seed (not just "an indigo") keeps the cutover non-jarring. Tokens live in `web-react/src/index.css` as oklch CSS variables.

### Role → token mapping

M3 roles don't map one-to-one onto shadcn's flatter semantic set; this is the mapping applied:

| shadcn token | M3 role | Notes |
|---|---|---|
| `--background` | `surface` | Lavender-tinted near-white in light. |
| `--foreground` | `onSurface` | |
| `--card`, `--card-foreground` | `surfaceContainerLowest` / `onSurface` | Card sits slightly above the page. |
| `--popover`, `--popover-foreground` | `surfaceContainerLow` / `onSurface` | Dialogs, toasts, selects. |
| `--primary`, `--primary-foreground` | `primary` / `onPrimary` | The indigo. `--ring` reuses `primary`. |
| `--secondary`, `--secondary-foreground` | `secondaryContainer` / `onSecondaryContainer` | |
| `--muted`, `--muted-foreground` | `surfaceContainerHigh` / `onSurfaceVariant` | |
| `--accent`, `--accent-foreground` | `secondaryContainer` / `onSecondaryContainer` | Hover/active surfaces. |
| `--destructive` | `error` | |
| `--border`, `--input` | `outlineVariant` | |
| `--chart-1..5` | `primary`, `tertiary`, `secondary`, `error`, `primaryContainer` | Categorical, indigo-harmonized; consumed by M8 results / M16 analysis. |

`--radius` (0.625rem) and the Geist font are unchanged from the M5 scaffold.

### Regenerating the tokens

Tokens were generated from `@material/material-color-utilities` (seed `0xFF3F51B5`) and converted to oklch — neither library is a runtime dependency (both were removed after generation). To regenerate (e.g. if the seed ever changes), recreate a throwaway script that builds a `SchemeTonalSpot` from the seed for `isDark` ∈ {false, true}, reads each `MaterialDynamicColors` role above via `.getArgb(scheme)`, and formats to oklch, then paste the values into the `:root` / `.dark` blocks in `index.css`. The `:root` block is authoritative; `.dark` is the M3 dark scheme kept for a future toggle.

## Light-only, dark retained

Flutter is light-only, so the app ships **light-only with no theme toggle** at parity. The `.dark` token block (the M3 dark indigo scheme) is retained so dark mode is a future flip rather than a re-derivation; `sonner.tsx`'s theme is correspondingly pinned to `light` with a TODO for when a toggle lands.

## Component inventory

Owned source under `web-react/src/components/ui/` (added via the shadcn CLI on the `base-nova` style, then styled to the indigo tokens), plus the hand-built primitives. Every component has a concrete downstream consumer — M7 builds them centrally so that work doesn't scatter into the behavior-focused surface ports.

| Component(s) | Flutter equivalent | First consumer |
|---|---|---|
| `button` | Filled/Outlined/Text button | everywhere |
| `input`, `textarea`, `label`, `field` | `TextFormField` | M6 auth (live), M11 create/edit |
| `checkbox`, `radio-group`, `switch` | `Checkbox`/`Radio`/`Switch` | M10 ballot, M11 feature flags |
| `select` | dropdown | M11 algorithm selection |
| `card` | `Card` | M8 results, M9 dashboard |
| `badge` | `Chip` | M8 winners, M9 status |
| `spinner` | `CircularProgressIndicator` | everywhere (loading) |
| `separator` | `Divider` | auth, forms |
| `dialog` | `Dialog`/`AlertDialog` | M9/M11/M14 confirmations |
| `sonner` (toast) | `SnackBar` | M9/M11/M12 |
| `typography` (`H1`–`H3`, `Lead`, `Prose`, `Muted`) | `TextTheme` | everywhere |
| `layout` (`Container`, `Stack`), `app-shell` | `Scaffold` / `AppBar` | M9+ surfaces |
| `EZVoteLogo` / `EZVoteMark` | app logo | header, auth cards |

The **bespoke ballot widgets** (drag-reorder, tie-break, auto-score-zero — parity checklist §4) are deliberately *not* here; they're built in M10 on top of these primitives, per [[Migration/Tech Stack]].

## Accessibility posture

Accessibility is the migration's central justification ([[Migration/Overview]]), so it's a first-class concern here:

- **Semantic HTML + Base UI primitives.** Interactive components (dialog, select, switch, checkbox, radio) ride Base UI, which provides keyboard operability, focus management, and ARIA roles. We style; we don't re-implement those.
- **Form association.** `Field` + `FieldLabel htmlFor` + `Input id` give every control a programmatic label; `FieldError` is `role="alert"`; invalid controls carry `aria-invalid`.
- **Visible focus.** All focusable elements show an indigo focus ring (`--ring`) via `focus-visible`.
- **Tested.** `src/components/ui/components.test.tsx` asserts label association, alert semantics, keyboard toggling, disabled handling, and dialog open/Escape/focus-restoration.

## Verifying it

`/design` (in `src/routes/Design.tsx`, unlinked from nav) renders every component and variant plus the color swatches — the surface for visually diffing M7 against Flutter and for the M18 side-by-side review.

## Parity items addressed

The pure-visual closed-bug items the parity checklist routed to M7: header emphasis (#7, via the typography primitives), learn-tab button sizing (#9/#64, via the single button sizing scale), and the logo assets (#17/#20, via `EZVoteLogo`). Narrow-desktop layout (#59) is mitigated by the `Container`/`Stack` width discipline and re-verified per surface.

# Toqar Design System

Brand foundation for **Toqar** — product analytics for agentic products
("Mixpanel for the agentic world"). Toqar measures AI agents doing real work:
task success, cost per task, tool failures, human takeovers. Its framework is
**TOQAR** — **T**ask success, **O**perational efficiency, **Q**uality & drift,
**A**utonomy & trust, **R**etention.

> **Personality:** precise, evidence-first, calm. Every number in the product
> traces to a query — the design should feel like that. Think **instrument, not
> billboard.**

**Audience:** founders and engineers at AI-native startups (AI SDRs, coding
agents, support automation). They live in terminals, Slack, and GitHub.

**Anti-goals (never do these):** generic AI gradients, sparkles/robot clichés,
dashboard-vendor blue, enterprise beige, dark-mode-only edginess.

## Sources
This system was authored from a written brand brief only — **no codebase,
Figma file, or existing product screens were provided.** Every value (colors,
type scale, spacing) is an original derivation from the brief. If product
screens or a Figma library exist, share them and this system will be
reconciled against them.

## Brand decisions (locked)
- **Wordmark — “Instrument”:** lowercase `toqar` in IBM Plex Sans semibold on a
  measurement baseline (hairline rule with three teal calibration ticks).
- **Logo — “Keycap Q”:** a square-form Q (rounded-square outline in text color)
  with a solid teal square tail. Terminal-native; deliberately not a circle,
  dial, or gauge. Assets: `assets/toqar-mark.svg` (light bg),
  `assets/toqar-mark-dark.svg` (dark bg), `assets/favicon.svg` (16px, thicker
  strokes). At small sizes use the favicon geometry.
- **Primary:** Toqar teal `#0e7c7b` (confirmed after exploring indigo ink,
  signal orange, and graphite — see `explorations/`).

---

## Content fundamentals
How Toqar writes, everywhere:

- **Voice:** declarative and specific. State the finding, then the evidence.
  *"reply_to_lead cleared 62% task success — but a third of wins were
  self-reported, not verified."* Never hype, never hedge.
- **Person:** address the partner as **you** ("a question you can now answer");
  refer to the agent by its literal event name (`reply_to_lead`), not "the AI".
- **Numbers are the nouns.** Prefer a figure to an adjective. Every number is
  tabular mono and, wherever possible, cites its query (`↳ q_8f21c`).
- **Casing:** sentence case for headings and UI. `UPPERCASE` only for the small
  tracked eyebrow labels (`HEADLINE FINDING`) and the `TOQAR` framework lockup.
- **Identifiers stay verbatim & mono:** event and property names render exactly
  as they appear in the stream — `task_completed`, `human_takeover`,
  `self_reported` — never prettified to "Task Completed".
- **Verified vs. claimed:** language distinguishes measured truth from claims.
  `verified` is earned; `self_reported` is neutral, never celebrated.
- **No emoji.** No exclamation marks. Directionality is shown with ▲ ▼ – and
  color, not with 🚀/✅. Tone is calm; a bad week is reported as plainly as a
  good one.

## Visual foundations
- **Color:** cool graphite neutral ramp (no beige). One primary — **Toqar teal**
  `#0e7c7b` (terminal-adjacent, deliberately not vendor-blue). Semantic colors
  are keyed to product concepts: `verified`=green, `failed`=red,
  `abandoned`=ochre, `handoff`=violet (human touch), `autonomous`=teal (the
  agent acting alone). Five categorical **TOQAR** layer accents (T blue / O teal
  / Q violet / A amber / R magenta) stay distinct in a legend. Full light + dark
  themes; text pairings meet WCAG AA.
- **Type:** **IBM Plex Sans** for UI, **IBM Plex Mono** for all data — numbers,
  queries, and event names. Mono runs constantly and carries data density with
  tabular lining figures. Scale is compact (11→40px, 1.20 ratio).
- **Spacing & radius:** 4px base with a tight low end (2/4/6/8) for dense tables
  and badges. Radii are small and precise — 2/4/6/8/12px, plus a pill only for
  chips and status badges. Nothing is soft or floaty.
- **Backgrounds:** flat surfaces only. No imagery, no gradients, no textures,
  no full-bleed photography. The one "texture" is data itself — mono rows,
  tabular columns, hairline `--border-subtle` dividers.
- **Cards & elevation:** 1px `--border` + `--radius-md`, `--shadow-sm/md`.
  Shadows are restrained and cool-tinted (an instrument panel, not a web app).
- **Borders:** hairline `--border` for structure, `--border-subtle` between
  table rows, `1px dashed` for the query-footnote rule, a `1.5px` accent border
  or 3px left rule to mark a callout / Slack message.
- **Motion:** calm and quick. `--ease-standard` (cubic-bezier(0.2,0,0.1,1)),
  90–150ms. Fades and small position shifts only — no bounce, no infinite loops.
  A caret/cursor block is the only "alive" element.
- **Hover / press:** hover darkens the primary (`--primary-hover`) or lifts
  surface tint; press is a color step, never a scale-bounce.
- **Layout rule:** left-aligned, column-first, generous whitespace around dense
  blocks so numbers can breathe. Full light AND dark on every surface.

## Iconography
Toqar's default "iconography" is **typographic and glyph-based**, in keeping with
the instrument aesthetic:
- **Direction/state glyphs** use Unicode, in mono: `▲ ▼ –` for deltas, `↳` for a
  query trace/footnote, a `▮` block for the caret. These live in `DeltaBadge`,
  `StatusBadge`, and the report footnotes.
- **Status** is shown with a small colored dot + mono label rather than a picture
  icon (see `StatusBadge`).
- **No icon font or SVG icon set is bundled**, because none was provided and the
  brand deliberately avoids decorative marks. If line icons are needed later, the
  recommended substitute is **Lucide** (16px, 1.5px stroke) to match the hairline
  border weight — flag this as a substitution when adopted.
- **No emoji, ever**, in product or docs.

---

## Index / manifest
Root files:
- `styles.css` — global entry point (imports only). Consumers link this one file.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`.
- `assets/` — logo mark SVGs (`toqar-mark.svg`, `toqar-mark-dark.svg`,
  `favicon.svg`).
- `explorations/` — archived logo + primary-color option rounds.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Tokens, Brand).
- `components/data/` — reusable data primitives.
- `report/` — the weekly insight report component + cards.
- `SKILL.md` — Agent-Skill wrapper so this system is usable in Claude Code.

### Components
- **MetricsTable** (`components/data/MetricsTable.jsx`) — canonical TOQAR metrics
  table with layer accents and direction-aware deltas.
- **DeltaBadge** (`components/data/DeltaBadge.jsx`) — week-over-week change badge;
  color follows *goodness* (up-good vs up-bad), not raw sign.
- **StatusBadge** (`components/data/StatusBadge.jsx`) — run verification state:
  verified / self_reported / failed / abandoned / handoff / autonomous.
- **EventChip** (`components/data/EventChip.jsx`) — mono chip for an event or
  property name (`step_executed`).
- **WeeklyReport** (`report/WeeklyReport.jsx`) — partner insight report,
  `email` (PDF) and `slack` (compact) variants, composing all four primitives.

### Fonts
IBM Plex Sans + IBM Plex Mono are loaded via the Google Fonts CDN in
`tokens/fonts.css`. **Caveat:** because they load from a CDN `@import`, the
compiler reports 0 self-hosted webfonts. For production/offline use, self-host
the IBM Plex `.woff2` files and replace the CDN `@import` with local `@font-face`
rules — the family names already match, so no other change is needed.

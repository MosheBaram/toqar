# Sync provenance

Synced from Claude Design project **Toqar Design System**
(`9aa7e362-a932-4bea-b7e0-54214fd31013`, claude.ai/design) via DesignSync:
D1 (brand foundation) and D2 (product surface) both on 2026-07-07. The
Claude Design project is the canonical source — edit there, then re-sync
incrementally; do not hand-edit vendored files except to record a
deliberate local divergence here.

**Vendored (D1):** `readme.md`, `SKILL.md`, `styles.css`, `tokens/`
(4 files), `assets/` (3 SVGs), `components/data/` (4 components,
JSX + d.ts), `report/WeeklyReport` (JSX + d.ts).

**Vendored (D2):** `components/feed/` (FindingCard + LayerKey, Sparkline),
`components/evidence/` (EvidenceDrilldown), `components/slack/`
(SlackFinding), `components/controls/` (AutonomyDial + AUTONOMY_LEVELS),
`ui_kits/app/` (appshell.jsx + feed / feed-empty / registry / onboarding
pages); `readme.md` updated to the D2 index.

**D2 caveats:**
- `ui_kits/app/*.html` are **reference screens, not runnable pages** here:
  they load React/Babel from CDN and the design project's `_ds_bundle.js`
  (`window.ToqarDesignSystem_9aa7e3`), which is project infrastructure and
  not vendored. Treat them as the layout/interaction/copy spec for change
  1.5 (`findings-experience`); the JSX components are the buildable source.
- Sample copy in `registry.html` / `onboarding.html` / `feed-empty.html`
  illustrates a *customer's* registry and uses some non-canonical event
  names where TOQAR core events exist (`tool_called` ~ `step_executed`
  with `step_type=tool_call`; `human_takeover` ~ `human_overrode`;
  `run_abandoned` ~ `task_abandoned`). Legitimate as product-specific
  event examples, but change 1.5 should render canonical TOQAR names for
  core events; fix upstream in Claude Design if partner-facing.

**Not vendored (live in the Claude Design project only):**
`guidelines/*.card.html` and `components/**/*.card.html` (preview specimen
cards), `explorations/` (archived logo/color option rounds),
`*.prompt.md` per-component usage cards, and `_ds_*` project
infrastructure.

**Known caveats (from the project readme):**
- Fonts load from the Google Fonts CDN via `@import` in `tokens/fonts.css`;
  self-host IBM Plex `.woff2` files before any production/offline use.
- `WeeklyReport.jsx` exports `SAMPLE_REPORT` — clearly-labeled example
  content for previews, not product data.

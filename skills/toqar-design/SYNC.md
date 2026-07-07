# Sync provenance

Synced from Claude Design project **Toqar Design System**
(`9aa7e362-a932-4bea-b7e0-54214fd31013`, claude.ai/design) on 2026-07-07
via DesignSync. The Claude Design project is the canonical source —
edit there, then re-sync incrementally; do not hand-edit vendored files
except to record a deliberate local divergence here.

**Vendored:** `readme.md`, `SKILL.md`, `styles.css`, `tokens/` (4 files),
`assets/` (3 SVGs), `components/data/` (4 components, JSX + d.ts),
`report/WeeklyReport` (JSX + d.ts).

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

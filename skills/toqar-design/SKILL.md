---
name: toqar-design
description: Use this skill to generate well-branded interfaces and assets for Toqar (product analytics for agentic products — "Mixpanel for the agentic world"), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, tokens, and UI components (metrics table, delta/status badges, event chips, weekly report) for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key entry points:
- `styles.css` — link this one file to get all tokens and fonts.
- `readme.md` — brand voice, visual foundations, iconography, full index.
- `tokens/` — color, type, spacing custom properties (both light and `[data-theme="dark"]`).
- `components/data/` and `report/` — React components; each has a `.prompt.md` with usage.

Golden rules: instrument, not billboard. IBM Plex Sans for UI, IBM Plex Mono for all numbers/queries/event names. No gradients, no emoji, no vendor-blue. Every number should trace to a query.

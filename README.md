# Toqar

Product analytics for agentic products, built agent-first. Currently in
Phase 0: the validation toolkit for an 8-week design-partner concierge test.

## What exists today

- `packages/registry` — TOQAR event schemas (typed, Zod-validated),
  registry-entry and tracking-plan types, tracking-plan markdown renderer.
- `packages/registry-service` — tenant-scoped registry backend (Fastify +
  Postgres): TOQAR taxonomy seeded per tenant, atomic tracking-plan
  application, append-only audit trail. Tests run on in-process Postgres.
- `packages/cli` — `toqar sync`: registry-as-code. Diffs
  `analytics/registry.json` against the backend, renders the diff as a
  tracking plan, applies or pulls.
- `skills/instrument-agentic-app` — Claude Code skill that instruments a
  design partner's repo with TOQAR events via PR.
- `skills/toqar-design` — the Toqar design system (brand tokens, data
  components, weekly-report layouts), synced from Claude Design.
- `docs/validation` — templates and scorecard for the concierge validation.
- `docs/roadmap.md` — the gated phase plan from validation to GA.

Nothing else. No ingestion, no dashboard, no services — by design, until
validation reads green. See `new-repo-handoff/KICKOFF-PROMPT.md` for the full spec.

## Development

    pnpm install
    pnpm test
    pnpm typecheck

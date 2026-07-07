# Toqar

Product analytics for agentic products, built agent-first. Currently in
Phase 0: the validation toolkit for an 8-week design-partner concierge test.

## What Phase 0 builds

Landing task-by-task via `openspec/changes/phase-0-validation-toolkit`:

- `packages/registry` — TOQAR event schemas (typed, Zod-validated),
  registry-entry and tracking-plan types, tracking-plan markdown renderer.
- `skills/instrument-agentic-app` — Claude Code skill that instruments a
  design partner's repo with TOQAR events via PR.
- `docs/validation` — templates and scorecard for the concierge validation.

Nothing else. No ingestion, no dashboard, no services — by design, until
validation reads green. See `new-repo-handoff/KICKOFF-PROMPT.md` for the full spec.

## Development

    pnpm install
    pnpm test
    pnpm typecheck

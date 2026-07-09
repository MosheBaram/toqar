# Toqar

Product analytics for agentic products, built agent-first. Currently in
Phase 0: the validation toolkit for an 8-week design-partner concierge test.

## What exists today

- `packages/registry` — TOQAR event schemas (typed, Zod-validated),
  registry-entry and tracking-plan types, tracking-plan markdown renderer.
- `packages/registry-service` — tenant-scoped registry backend (Fastify +
  Postgres): TOQAR taxonomy seeded per tenant, atomic tracking-plan
  application, append-only audit trail. Tests run on in-process Postgres.
- `packages/cli` — `toqar sync` (registry-as-code diff/apply/pull) and
  `toqar instrument <path>` (agent-driven instrumentation with a hard
  review gate).
- `packages/instrumentation-agent` — the productized concierge: seam
  scanning, plan proposal, seam maps compounding in the backend,
  approved-plan implementation with host verification, PR assembly, and
  recorded merge rate. TS/Express/React/LLM-SDK repos; refuses others.
- `packages/sdk` — `@toqar/sdk`: typed fire-and-forget emitters with
  batching, envelope completion, dev validation, and a kill switch.
- `packages/collector` — authenticated validating event intake (per-item
  202 semantics, rejection accounting) plus OTLP/HTTP trace intake mapped
  to TOQAR events; buffered publishing rides broker outages.
- `packages/analysis` — the deterministic layer: 21 TOQAR metrics as
  parameterized ClickHouse SQL with content-hashed citation ids, plus
  pure statistical primitives (anomaly, changepoint, segmentation,
  correlation). Zero LLM dependencies by construction.
- `packages/pipeline` — Redpanda → ClickHouse delivery with `event_id`
  idempotency; dev stack in `infra/docker-compose.yml`, exercised by a
  real-pipe integration CI job. Production deploy is a documented runbook
  awaiting an operator (see `packages/pipeline/README.md`).
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

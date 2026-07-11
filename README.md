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
- `packages/analysis-agent` — playbooks over the semantic layer, honest
  sweeps, the question-log eval harness, Slack Block Kit delivery, and
  the automated weekly digest — every published number cited.
- `packages/mcp-server` — read-only MCP surface for customers' own
  agents: metrics with citations, findings, registry, experiments.
- `packages/experiments` — always-valid sequential testing (bounded
  false-positives under continuous peeking) + flag-provider seam
  (PostHog/LaunchDarkly) + per-arm guardrail SQL. Pure, no LLM.
- `packages/experiment-agent` — the third loop: finding → hypothesis →
  variant PR (gated on autonomy level 2) → sequential monitoring with
  guardrail auto-stop → verdict to the registry as an experiment finding.
- `apps/web` — the findings feed (filters, evidence drill-down, registry
  browser, audited autonomy dial, onboarding + benchmark views) on the
  design-system tokens.
- `apps/operator` — the internal cross-tenant operator console (tenant
  list, per-tenant drill-down, platform rollups, service health) behind an
  audited `operator` token scope; the one deliberate cross-tenant read
  path, proven closed to tenants by the isolation suite. Deploy is
  operator-gated.
- `apps/docs` — public docs anchored on the schema spec, with a CI
  cross-reference gate so docs cannot drift from the code.
- `packages/billing` — usage meters (reconcile to source), tiers seeded
  from validation WTP, Stripe references only (no card data).
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

## Security

Multi-tenant isolation is enforced at two layers — application-level
tenant scoping plus Postgres row-level security beneath it — and proven
every CI run by a standing adversarial suite (`packages/isolation-suite`)
that attacks every service surface with wrong-tenant, wrong-scope,
absent, and revoked credentials. Tenant tokens are hashed, scoped, and
revocable. The SOC 2 Type 1 control checklist and operator access
inventory live in `docs/security/` and are maintained at every change's
close-out; a CI secret scan blocks credential-shaped strings. Claims
there are marked `implemented` / `partial` / `planned` honestly —
encryption-at-rest and backups are deployment-gated and not yet live.

## Development

    pnpm install
    pnpm test
    pnpm typecheck

See `ARCHITECTURE.md` for how the packages and apps compose (the dependency
graph, the control-plane/data-plane split, and the cross-cutting
invariants), and `CONTRIBUTING.md` for the full clone-to-green setup,
including the docker-compose integration suite and the anti-slop gate. The
customer-facing docs site is `apps/docs` (see `packages/registry/README.md`
for the schema spec it's anchored on).

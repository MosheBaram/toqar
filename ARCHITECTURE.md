# Architecture

How Toqar's packages and apps compose. This is the contributor's map; for
the product vocabulary (the TOQAR metrics framework) see
`packages/registry/README.md`, and for the customer-facing docs site see
`apps/docs`.

Toqar is a pnpm-workspaces monorepo: 14 packages under `packages/` and two
apps under `apps/`, TypeScript strict throughout. The dependency graph
below is the real `@toqar/*` graph from each package's `package.json` — the
contributor-docs drift check keeps it honest.

## Dependency layering

Arrows point from a package to what it depends on. Read top-down: leaves
have no `@toqar` dependencies; each layer builds on the ones above it.

```
  Leaves (no @toqar deps)
    registry            analysis            experiments
      │  │  │              │  │                 │  │
      │  │  └──────────────┼──┼─────────────┐   │  │
  Foundation             │  │             │   │  │
    sdk ─▶ registry      │  └─▶ billing ─▶ analysis
    billing ─▶ analysis  │        │
    registry-service ─▶ registry, billing
      │
  Services & agents
    collector ─────────▶ registry, registry-service
    instrumentation-agent ▶ registry, registry-service
    analysis-agent ──────▶ analysis, registry
    experiment-agent ────▶ experiments, registry, registry-service
    pipeline ────────────▶ collector, registry, analysis,
                            registry-service, experiments, billing
    mcp-server ──────────▶ analysis, registry, pipeline,
                            analysis-agent, registry-service
    isolation-suite ─────▶ registry, collector, registry-service,
                            mcp-server, analysis-agent   (test-only)

  Apps & entrypoints
    apps/web  ─▶ registry, analysis, registry-service
    apps/docs ─▶ analysis, registry
    cli       ─▶ registry, instrumentation-agent, registry-service
```

`isolation-suite` is test-only: it composes the real service apps and
attacks them; it has no runtime consumers.

## Control plane vs. data plane

**Control plane — Postgres, via `registry-service`.** The shared contract
and tenant state: registry entries (the typed event schema every agent
reads and writes through), tenants, scoped tokens, the autonomy dial,
onboarding timeline, billing meters, and an append-only audit trail. Per
tenant, strictly isolated. `apps/web`, `cli`, `collector`, and the agents
all authenticate and scope through it.

**Data plane — Redpanda + ClickHouse.** Events flow
`@toqar/sdk` (or OTLP) → `collector` (validate, tenant-scope, buffer) →
Redpanda → `pipeline` (idempotent delivery by `event_id`) → ClickHouse.
`analysis` is the deterministic semantic layer that compiles TOQAR metrics
to parameterized ClickHouse SQL. The dev stack is `infra/docker-compose.yml`,
exercised by `pipeline`'s integration test.

**Agents — the three loops.** `instrumentation-agent` (it instruments for
you: seam scan → tracking plan → PR), `analysis-agent` (it analyzes for
you: playbooks over the semantic layer → cited findings → Slack), and
`experiment-agent` (it iterates for you: hypothesis → variant PR →
sequential monitoring → verdict to the registry).

**Interfaces.** `apps/web` (the per-tenant findings feed), `apps/docs`
(public docs), `cli` (`toqar` for developers/CI), and `mcp-server`
(read-only MCP so customers' own agents can query their analytics).

## Cross-cutting invariants

These hold across every layer and are enforced, not just intended:

- **Per-tenant isolation.** Application-level tenant scoping plus Postgres
  RLS (a non-owner `toqar_app` role; `tenantTransaction` sets the role and
  `app.tenant`). Deliberate cross-tenant reads (e.g. benchmarking opt-in)
  run through a small set of named, audited owner-run methods. The
  `isolation-suite` attacks every surface with wrong/absent/revoked/
  mis-scoped credentials on every CI build; a new surface must register
  there to ship.
- **Deterministic customer-facing numbers.** LLMs decide *what* to look at;
  deterministic code computes *the numbers*. `analysis` has zero LLM
  dependencies by construction. No LLM-generated arithmetic ever reaches a
  customer-facing figure.
- **The citation contract.** Every product number carries a `q_<hash>`
  query id back to the semantic-layer query that produced it
  (`validateFindingCitations`). Narration interpolates only registered
  metric value strings, so citations hold by construction.
- **The human-in-the-loop boundary.** All code changes go through PRs; all
  analysis is autonomous. Autonomy is a per-tenant dial, sequenced
  read-only → instrumentation PRs → experiment PRs, and every grant is
  audited.
- **Anti-slop.** No fake data, `Math.random`, or placeholder
  implementations in product code — enforced by `scripts/anti-slop-check.sh`
  in CI. A metric either computes from real data or does not exist.

## CI

- **`verify`** (required, all changes): install → build → typecheck → test →
  anti-slop. Workspace packages resolve each other's types from `dist/`, so
  the build runs topologically before typecheck.
- **`integration`** (data-plane changes): brings up `infra/docker-compose.yml`
  and runs `pipeline`'s real-pipe test end-to-end.

See `CONTRIBUTING.md` for running these locally.

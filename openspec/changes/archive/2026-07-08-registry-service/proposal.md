# Registry Service

## Why

The registry is Toqar's shared contract, but today it exists only as a library (`@toqar/registry`) and as markdown in partner repos. Phase 1 change 1.1 (roadmap): make it a backend — versioned, tenant-scoped, synced with the customer's repo — so every agent (instrumentation, analysis, experiment) reads and writes through one source of truth, and customer context starts compounding (the moat).

## What Changes

- New package `@toqar/registry-service`: a Fastify HTTP API over Postgres holding registry entries per tenant — CRUD, tracking-plan diff application, append-only audit trail, TOQAR default taxonomy seeded on tenant creation.
- New package `@toqar/cli`: `toqar sync` — registry-as-code. Diffs `analytics/registry.json` in a customer repo against the backend, renders the diff as a tracking plan (reusing `trackingPlanSchema`/`renderTrackingPlan`), and applies or pulls on request.
- Tenant isolation groundwork (cross-cutting track 1.6 starts here): every row tenant-scoped, bearer-token auth, no cross-tenant access by construction.
- First services-grade test infrastructure: in-process Postgres (PGlite) so CI needs no containers.

## Capabilities

### New Capabilities

- `registry-backend` — the tenant-scoped registry store and HTTP API: entry CRUD, diff application, audit trail, default taxonomy, auth/isolation, edge validation.
- `registry-sync` — registry-as-code: the `analytics/registry.json` file format and the `toqar sync` diff/apply/pull workflow.

### Modified Capabilities

None (the `event-registry` and `tracking-plan` library capabilities are consumed as-is; their schemas validate every payload).

## Impact

- Two new workspace packages (`packages/registry-service`, `packages/cli`); both consume `@toqar/registry` (which has tests and now gains its first real consumers — satisfies the depth-before-breadth rule).
- New dependencies: `fastify`, `postgres` (client), `@electric-sql/pglite` (dev/test).
- CI unchanged in shape (typecheck, test, anti-slop) — new packages ride the same gates.
- No deployment in this change: the service runs locally/partner-hosted until the ingestion plane (change 1.3) forces a hosting decision.

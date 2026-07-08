# Design — Registry Service

## Context

First Phase 1 change and the repo's first service. Everything until now is a library (`@toqar/registry`), a skill, and docs. Constraints carried forward: strict TS, TDD, anti-slop gates, every commit green through the PR pipeline. The `registry-backend` and `registry-sync` specs define WHAT; this records the HOW decisions.

## Goals / Non-Goals

**Goals:** tenant-scoped registry backend; registry-as-code sync CLI; audit trail; TOQAR default taxonomy; tenancy groundwork; container-free test infrastructure.

**Non-Goals:** hosting/deployment (decided in change 1.3); real user auth/SSO (change 1.6 — bearer tokens suffice now); registry UI (change 1.5 renders it); event *data* storage (ClickHouse, change 1.3 — this service stores only the contract, never events).

## Decisions

### D1: Store on a `SqlExecutor` seam; PGlite in tests, Postgres in production

The store module (`RegistryStore`) is written against a two-method `SqlExecutor` interface (`query(text, params)` + `transaction(fn)`). Production binds the `postgres` client; tests bind `@electric-sql/pglite` (in-process WASM Postgres) — real SQL, real transactions, zero containers in CI. Alternatives: Docker Postgres in CI (slower, infra-heavy), mocking the store (forbidden in spirit — mocks hide SQL bugs; the anti-slop culture wants real execution).

### D2: Plain SQL migrations, no ORM

Numbered `.sql` files applied by a small migrate function recorded in a `migrations` table. Zod validates payloads at the edge; SQL stays visible. Alternatives: Drizzle/Prisma — rejected for two tables' worth of schema; revisit when the control plane grows (change 1.3+).

### D3: Fastify with zod validation at the boundary

Routes parse bodies with `@toqar/registry` schemas before touching the store; errors return structured issues. Auth is a preHandler resolving bearer token → tenant (SHA-256 token hashes in the `tenants` table). Route shape: `/v1/registry/*` scoped by the *authenticated* tenant — tenant id never appears in the URL, which makes cross-tenant requests unrepresentable rather than merely checked.

### D4: Diff semantics — `removed` means deprecate, never delete

Applying a plan's `removed` sets `status: deprecated` (historical queries depend on old events; the audit trail depends on continuity). Hard delete does not exist in the API. Apply is transactional: validate whole plan → apply whole plan → one audit record per affected entry, or nothing.

### D5: Stale-check via registry fingerprint

`toqar sync` fetches the backend registry, computes the diff, and submits the plan together with a fingerprint (hash of the backend state it diffed against). The service rejects on mismatch (409) — optimistic concurrency without version bookkeeping in the file.

### D6: Two packages, one change

`registry-service` and `cli` land together because the sync CLI is the service's first real consumer — shipping the service alone would violate the "no package without a real consumer" rule in the other direction. The CLI reuses `trackingPlanSchema`/`renderTrackingPlan` verbatim, keeping diff presentation identical to the instrumentation skill's output.

## Risks / Trade-offs

- [PGlite behavior diverges from real Postgres] → SQL kept to boring core features (no extensions); a smoke script against real Postgres documented in the service README for pre-deploy checks.
- [Bearer tokens are weak credentials] → Acceptable pre-customers; hashed at rest, env-only in the CLI, rotation = row update. Real authn is change 1.6 and the spec's isolation scenarios keep passing regardless of credential scheme.
- [Two new packages widen the surface] → Both ride the existing CI gates; anti-slop check already scans `packages/`.

## Open Questions

- None blocking. Hosting, backups, and SLOs deliberately deferred to change 1.3 when something is worth hosting.

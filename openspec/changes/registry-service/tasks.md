# Tasks — Registry Service

> TDD throughout (test red → implement → green), every group ships through the branch → PR → CI → merge → pull loop. Specs: `registry-backend`, `registry-sync`. Design decisions D1–D6 govern the HOW.

## 1. Service package scaffold and test infrastructure

- [x] 1.1 Scaffold `packages/registry-service` (`@toqar/registry-service`, strict tsconfig extending base, vitest config; deps: `fastify`, `postgres`, `zod`, workspace `@toqar/registry`; dev: `@electric-sql/pglite`)
- [x] 1.2 Implement `SqlExecutor` seam (D1): interface + PGlite test binding + `postgres` production binding; failing-then-green test proving both run the same trivial query and transaction (runtime test covers the PGlite binding; the `postgres` binding shares the interface and is compile-checked + smoke-scripted per D1 risk note)
- [x] 1.3 Migration runner (D2): plain-SQL migrations as ordered `{id, sql}` records (SQL stays visible; TS modules instead of loose `.sql` files so builds need no asset copying), `migrations` bookkeeping table; test: applying twice is idempotent
- [x] 1.4 Commit, PR, merge

## 2. Store: tenants, entries, audit (spec: registry-backend)

- [ ] 2.1 Migration 001: `tenants` (id, name, token_hash), `registry_entries` (tenant-scoped, unique per event), `audit_log` (append-only)
- [ ] 2.2 TDD `RegistryStore.createTenant`: seeds the ten TOQAR core events as `active` at `SCHEMA_VERSION` (Default-taxonomy scenario)
- [ ] 2.3 TDD entry CRUD: round-trip scenario; invalid payload rejected before SQL (Edge-validation scenario)
- [ ] 2.4 TDD `applyPlan`: atomic add/modify/deprecate with fingerprint stale-check (D4, D5); scenarios: applied-atomically, bad-plan-rejected-whole
- [ ] 2.5 TDD audit trail: one record per affected entry, newest-first listing, no mutation path (Mutations-audited scenario)
- [ ] 2.6 Commit, PR, merge

## 3. HTTP API (spec: registry-backend)

- [ ] 3.1 TDD auth preHandler: bearer → tenant via token hash; 401 scenarios; route shape carries no tenant id (D3)
- [ ] 3.2 TDD routes: `GET/PUT /v1/registry/events[/:event]`, `POST /v1/registry/apply`, `GET /v1/registry/audit` — wired to the store, zod at the boundary
- [ ] 3.3 TDD cross-tenant isolation scenario: tenant A token cannot reach tenant B data by any route shape
- [ ] 3.4 TDD `GET /health`: truthful DB reachability (Degraded-database scenario)
- [ ] 3.5 Service README documenting routes, env vars, and the real-Postgres smoke script (D1 risk mitigation); commit, PR, merge

## 4. Sync CLI (spec: registry-sync)

- [ ] 4.1 Scaffold `packages/cli` (`@toqar/cli`, bin `toqar`; deps: workspace `@toqar/registry`)
- [ ] 4.2 TDD file loader: `analytics/registry.json` parsing, per-index validation errors, duplicate-event detection (Invalid-file scenario)
- [ ] 4.3 TDD diff engine: local vs backend → `TrackingPlan` (added/modified/removed) + fingerprint; scenarios: drift-shown, in-sync
- [ ] 4.4 TDD `toqar sync`: renders plan via `renderTrackingPlan`, exit codes (0 in-sync, designated code on diff), env-var config, missing-credentials scenario, token never printed
- [ ] 4.5 TDD `--apply` (posts plan + fingerprint, reports counts, 409 stale handling) and `--pull` (stable-sorted file write); mutual exclusivity
- [ ] 4.6 Commit, PR, merge

## 5. End-to-end verification and close-out

- [ ] 5.1 E2E test: PGlite-backed service instance + CLI against a temp repo dir — create tenant → pull (ten TOQAR events) → add a product event locally → sync (diff shown) → apply → re-sync in-sync (registry-sync Apply-round-trip scenario)
- [ ] 5.2 Root README: move registry-service and cli into "What exists today" only with what they verifiably do
- [ ] 5.3 `openspec validate registry-service --strict`; full gates green; commit, PR, merge

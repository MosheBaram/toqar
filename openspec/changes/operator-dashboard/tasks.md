# Tasks — Operator Dashboard

> Read-only cross-tenant console behind an audited `operator` scope. TDD; each group ships through branch → PR → CI → merge. The cross-tenant door registers in the adversarial suite before the UI is built.

## 1. Operator scope + cross-tenant read methods (spec: registry-backend delta, operator-console)

- [x] 1.1 Extend the token scope enum with `operator`; issue/revoke already audited (reuse). Bootstrap: an audited seed command for the first operator token
- [x] 1.2 TDD owner-run store methods: `listTenants`, `tenantSnapshot(id)` (registry summary, onboarding, autonomy, billing, instrument runs, experiments), each audited as an operator read
- [x] 1.3 TDD rollup methods reconciling to source: merge rate (merged/delivered over instrument_runs), rejection reasons, onboarding funnel + median time-to-first-finding, revenue
- [x] 1.4 Commit, PR, merge

## 2. Operator API + isolation proof (spec: operator-console)

- [x] 2.1 `/operator/*` auth preHandler requires the `operator` scope; TDD tenant-token-403 and operator-token-200
- [x] 2.2 Routes: `GET /operator/tenants`, `GET /operator/tenants/:id`, `GET /operator/rollups`, `GET /operator/health` (aggregates collector + registry health truthfully)
- [x] 2.3 Register every `/operator/*` route in `packages/isolation-suite` with the tenant-token-refused assertion class (any tenant scope → 403)
- [x] 2.4 Commit, PR, merge

## 3. Operator app (spec: operator-console)

- [x] 3.1 Scaffold `apps/operator` (Vite + React strict; design-system tokens; reuse D2 primitives)
- [x] 3.2 Tenant list + per-tenant drill-down against the operator API; honest empty/pending states
- [x] 3.3 Platform rollups view (merge rate, rejections, onboarding funnel, revenue) and the service-health view; TDD the API client against the real service
- [x] 3.4 Commit, PR, merge

## 4. Close-out

- [x] 4.1 `apps/operator` + operator scope documented (README + root README); note the deploy is operator-gated with the platform
- [x] 4.2 `openspec validate --strict`; full gates green; commit, PR, merge

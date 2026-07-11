# Operator Dashboard

## Why

The platform captures everything an operator needs to run Toqar — instrumentation merge rate, collector rejection counters, onboarding funnel and time-to-first-finding, billing usage, experiment verdicts, per-service health — but there is no console to see any of it. Today an operator reads it through the API or CLI, one tenant at a time. This change builds the internal cross-tenant operator dashboard so running the business is a view, not a query. It is deliberately separate from the customer product (`apps/web`, a per-tenant findings feed) — different audience, different data scope, different auth.

## What Changes

- New app `apps/operator`: an internal cross-tenant console (Vite + React on the design-system tokens). Tenant list; per-tenant drill-down (registry, onboarding stage, autonomy level, billing tier/usage, instrumentation runs, experiments); platform rollups (merge rate, rejection reasons, onboarding funnel, revenue).
- New capability `operator-console` and its backend surface: an **operator-scoped** read API over the existing stores — the deliberate cross-tenant read path, gated by a new `operator` token scope, audited, and never exposed to tenant tokens.
- New service-health surface: aggregate the truthful health the services already report (collector broker state + buffer, registry `/health`) into one operator view.
- Registry-backend gains the `operator` token scope and the cross-tenant read methods (the counterpart to the strict per-tenant isolation everywhere else).

## Capabilities

### New Capabilities

- `operator-console` — the cross-tenant operator API and dashboard: tenant list, per-tenant drill-down, platform rollups, and service health, behind an audited operator scope.

### Modified Capabilities

- `registry-backend` — an `operator` token scope and the cross-tenant read methods it authorizes (new requirement; per-tenant isolation for all other scopes is unchanged).

## Impact

- One new app (`apps/operator`) + operator routes on the registry service; consumes every existing store read-only.
- Depends on all of Phase 1 + 2 (shipped). No new data is invented — the dashboard only surfaces what the stores already record.
- **Security-critical**: this is the one path that reads across tenants by design (like benchmarking opt-in, but broader). It ships behind an `operator` scope, is fully audited, and every operator route is registered in the adversarial isolation suite proving a *tenant* token can never reach it.
- Deployment/hosting of the operator app is operator-gated with the rest of the platform; the code and its gates are built here.

# Design — Operator Dashboard

## Context

Everything an operator needs is already recorded (merge rate in `instrument_runs`, rejection counters in the collector, onboarding timeline, billing usage, experiments, health endpoints) but has no console. This change adds the read-only cross-tenant surface and its UI. The load-bearing tension: the entire platform is built on strict per-tenant isolation (RLS + `tenantTransaction` + the adversarial suite), and this feature deliberately reads *across* tenants. It must do so through exactly one audited, scoped door.

## Goals / Non-Goals

**Goals:** one operator console for tenant list, per-tenant drill-down, platform rollups, and service health; a single audited cross-tenant read path behind an `operator` scope; no new data (surface what's recorded).

**Non-Goals:** operator *mutations* of tenant data (read-only this change — no editing a tenant's registry or billing from the console); real-time streaming (poll/refresh is fine at this scale); SSO/operator user management (the `operator` token scope suffices now, like tenant tokens); hosting/deploy (operator-gated with the platform).

## Decisions

### D1: Reuse the token scope machinery — add `operator`

Token scopes already exist (`events:write`, `api:full`) with issue/revoke/audit. This adds a third: `operator`. The auth preHandler for `/operator/*` requires it and 403s everything else. No new auth system — the isolation suite already proves scope containment; `operator` joins that matrix.

### D2: Cross-tenant reads are owner-run store methods, mirroring `optedInTenants`

Benchmarking already established the pattern: a deliberate cross-tenant read runs as the DB owner (bypassing RLS) through one named method. Operator reads extend this — `listTenants`, `tenantSnapshot(id)`, and rollup methods — each owner-run, each audited. Per-tenant routes keep using `tenantTransaction`; only these explicitly-named operator methods read broadly. This keeps the blast radius one small, reviewable set of methods.

### D3: Rollups are computed from records, never modeled

Merge rate = merged/delivered over all `instrument_runs`; rejection reasons = summed collector counters; onboarding funnel = counts by `onboarding_timeline` stage + median time-to-first-finding; revenue = tier prices × active accounts, reconciled to invoices. Every number resolves to source rows — the same no-fabrication discipline as findings and billing. Empty state is honest zero/"no data".

### D4: `apps/operator` reuses the design system, not the customer app

A separate Vite+React app (not a mode of `apps/web`) — different audience and auth, and mixing operator and customer surfaces invites a scope leak. It links the same `skills/toqar-design` tokens and reuses D2 primitives (tables, badges, layer keys). This is a grid-of-rollups dashboard — the "not a dashboard grid" rule governs the *customer* feed, not the internal operator console.

### D5: Every operator route joins the adversarial suite

The isolation suite's contract is "new surfaces must register to ship." Operator routes register with an added assertion class: a *tenant* token (any scope) gets 403, and only an `operator` token reaches them. This makes the cross-tenant door provably closed to tenants on every CI run.

## Risks / Trade-offs

- [The cross-tenant door is the highest-value target] → single `operator` scope, single set of owner-run methods, full audit, adversarial-suite coverage asserting tenant tokens are refused; read-only removes the mutation blast radius entirely.
- [Rollups drift from source] → reconcile-to-source tests (merge rate == records) as first-class scenarios, same as billing meters.
- [Operator app widens the surface] → separate app keeps customer and operator auth from ever sharing a request path; it rides the existing CI gates.

## Open Questions

- Operator token issuance/rotation mechanics (bootstrap the first operator token) — resolve at implementation; likely a seed/admin CLI command, itself audited.
- Whether health aggregation polls services or reads a shared status table — decide with the deploy topology in hand (health endpoints already exist either way).

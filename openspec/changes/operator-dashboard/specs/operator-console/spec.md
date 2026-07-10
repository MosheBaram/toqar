# operator-console Specification

## ADDED Requirements

### Requirement: Operator scope gates every cross-tenant read

Operator routes SHALL require a token with the `operator` scope. A tenant-scoped token (`api:full` or `events:write`) SHALL NOT reach any operator route. Every operator action SHALL be audited with the operator identity.

#### Scenario: Tenant token cannot reach operator routes

- **WHEN** an `api:full` tenant token requests any `/operator/*` route
- **THEN** the response is 403 and no cross-tenant data is returned

#### Scenario: Operator access is audited

- **WHEN** an operator lists tenants or drills into one
- **THEN** the access is recorded with the operator identity and timestamp

### Requirement: Tenant list and per-tenant drill-down

The console SHALL list every tenant with summary state (name, onboarding stage, autonomy level, billing tier), and SHALL provide a per-tenant drill-down assembling that tenant's registry summary, onboarding timeline (incl. time-to-first-finding), autonomy grants, billing tier + current usage, instrumentation runs, and experiments — all read-only.

#### Scenario: Drill-down assembles real state

- **WHEN** an operator opens a tenant
- **THEN** the view shows that tenant's actual recorded state (no fabricated or estimated fields) drawn from the existing stores

### Requirement: Platform rollups from recorded data

The console SHALL compute cross-tenant rollups from data the stores already hold: instrumentation merge rate (from run outcomes), collector rejection reasons, the onboarding funnel and median time-to-first-finding, and recognized revenue (from billing tiers/invoices). Every rollup number SHALL be reproducible from its source records — no modeled or estimated figures.

#### Scenario: Merge rate reconciles to records

- **WHEN** the platform merge-rate rollup is shown
- **THEN** it equals merged over delivered across all tenants' instrumentation run records

#### Scenario: Empty platform is honest

- **WHEN** there are no tenants or no data yet
- **THEN** rollups show zero / "no data", never a placeholder figure

### Requirement: Service health aggregation

The console SHALL surface the truthful health the services already report — the collector's broker state and buffer depth, the registry service's database reachability — as one operator view, reflecting real state (degraded when degraded).

#### Scenario: Degraded service shown as degraded

- **WHEN** the collector reports a degraded broker
- **THEN** the operator health view shows it degraded, not ok

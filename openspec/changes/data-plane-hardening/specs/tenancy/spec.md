# tenancy Specification (delta)

## MODIFIED Requirements

### Requirement: Row-level security beneath application checks

Every tenant-scoped Postgres table SHALL carry RLS policies keyed to the request's tenant, so a bug in application-level filtering cannot read across tenants. Application checks remain; RLS is the net beneath them. **The net SHALL actually be engaged on the served path**: every tenant-scoped store operation runs inside a tenant-bound session (`tenantTransaction` — the non-owner `toqar_app` role + transaction-scoped tenant GUC). Policies SHALL use the once-per-statement initPlan form (`(SELECT current_setting('app.tenant'))`) and fail closed when the tenant context is unset. The deliberate owner-run paths are enumerated and each is inherently cross-tenant or pre-tenant: credential resolution by hash, tenant creation, the audited benchmarking cohort, and the operator plane. (`FORCE ROW LEVEL SECURITY` is deliberately not applied: the service connects as the owner and drops to `toqar_app` per tenant transaction — FORCE would break the enumerated owner-run paths, including token resolution itself; as-built decision recorded in the design.)

#### Scenario: Application bug contained

- **WHEN** a query is executed with tenant A's session context but a WHERE clause mistakenly omitting the tenant filter
- **THEN** RLS returns only tenant A's rows — verified against the *served* path (the store's own methods), not only a dedicated RLS test harness

#### Scenario: Unset tenant context fails closed

- **WHEN** a tenant-scoped query runs without the tenant GUC bound
- **THEN** it matches no rows (never all rows)

#### Scenario: Served path runs under the RLS-bound session

- **WHEN** any tenant-scoped registry API operation executes
- **THEN** it runs under the non-owner role with the tenant GUC transaction-scoped, so RLS policies apply to it

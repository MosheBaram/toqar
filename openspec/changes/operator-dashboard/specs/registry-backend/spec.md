# registry-backend Specification (delta)

## ADDED Requirements

### Requirement: Operator token scope and cross-tenant reads

The service SHALL support an `operator` token scope, distinct from the tenant scopes, that authorizes read-only cross-tenant methods (list tenants, read any tenant's recorded state, compute rollups). These methods run as the owner (bypassing per-tenant RLS by design) and are the only path that reads across tenants for operations; they SHALL be reachable only with the `operator` scope and SHALL append an audit record naming the operator.

#### Scenario: Operator scope issued and enforced

- **WHEN** an `operator`-scoped token is issued and used on a cross-tenant read method
- **THEN** the read succeeds; the same method with a tenant-scoped token is rejected

#### Scenario: Cross-tenant read is audited

- **WHEN** an operator reads across tenants
- **THEN** an audit record naming the operator is appended

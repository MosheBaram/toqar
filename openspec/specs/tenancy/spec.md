# tenancy Specification

## Purpose

Multi-tenant isolation guarantees and token lifecycle across all Toqar
services — application scoping, RLS beneath it, scoped revocable tokens,
and the standing adversarial suite that proves them.

## Requirements

### Requirement: Row-level security beneath application checks

Every tenant-scoped Postgres table SHALL carry RLS policies keyed to the request's tenant, so a bug in application-level filtering cannot read across tenants. Application checks remain; RLS is the net beneath them.

#### Scenario: Application bug contained

- **WHEN** a query is executed with tenant A's session context but a WHERE clause mistakenly omitting the tenant filter
- **THEN** RLS returns only tenant A's rows

### Requirement: Structural tenant scoping in analytics queries

The semantic layer SHALL make it impossible to compile a product query without a bound tenant parameter (typed builder requires it); the compiled SQL always filters on tenant id.

#### Scenario: Unscoped query unrepresentable

- **WHEN** a caller attempts to compile a metric without a tenant
- **THEN** it fails at the type/validation level — no SQL is produced

### Requirement: Token lifecycle

Tenants SHALL support multiple active tokens with scopes (`events:write` for SDK/collector, `api:full` for registry/MCP), rotation (add new, revoke old, no downtime window), and immediate revocation. Revoked tokens SHALL fail authentication everywhere within seconds.

#### Scenario: Rotation without downtime

- **WHEN** a new token is issued and the old one revoked after cutover
- **THEN** requests with the new token succeed throughout and the old token 401s everywhere after revocation

#### Scenario: Scoped token contained

- **WHEN** an `events:write` token calls a registry mutation route
- **THEN** the request is rejected with 403

### Requirement: Cross-service adversarial suite

A single test suite SHALL attack every service surface with wrong-tenant and wrong-scope credentials — registry API, collector intake, MCP tools, web API — and SHALL run in CI. New surfaces MUST register here to ship.

#### Scenario: Every surface attacked

- **WHEN** the adversarial suite runs
- **THEN** it covers each deployed surface and every attack yields 401/403/404 with zero foreign-tenant bytes returned

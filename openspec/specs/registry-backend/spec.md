# registry-backend Specification

## Purpose

The tenant-scoped registry backend: the shared contract every Toqar agent
reads and writes through — entry storage, tracking-plan application,
audit trail, default taxonomy, and tenant isolation.

## Requirements

### Requirement: Tenant-scoped registry entries

The service SHALL store registry entries per tenant, keyed by event name, with payloads validating against `registryEntrySchema` from `@toqar/registry` (event, description, journey, owner_metric, optional hypothesis, status, since_version). Entries SHALL be readable individually and as the tenant's full registry.

#### Scenario: Entry round-trip

- **WHEN** a tenant creates an entry for `task_completed` and reads it back
- **THEN** the returned entry equals the stored payload and validates against `registryEntrySchema`

#### Scenario: Invalid entry rejected at the edge

- **WHEN** a payload omits `owner_metric` or carries an unknown `status`
- **THEN** the API responds 400 with the validation issues and stores nothing

### Requirement: TOQAR default taxonomy on tenant creation

Creating a tenant SHALL seed its registry with the ten TOQAR core events (`TOQAR_EVENT_NAMES`) as `active` entries at `since_version` `SCHEMA_VERSION`, each carrying its layer's owner metric per the public schema spec.

#### Scenario: Fresh tenant is TOQAR-ready

- **WHEN** a tenant is created
- **THEN** its registry contains exactly the ten core events, all `status: active`

### Requirement: Tracking-plan diff application

The service SHALL accept a tracking plan (validating against `trackingPlanSchema`) and apply it atomically to the tenant's registry: `added` entries inserted, `modified` entries replaced, `removed` events set to `deprecated`. A plan that fails validation or references a missing event for modify/remove SHALL be rejected whole — no partial application.

#### Scenario: Plan applied atomically

- **WHEN** a valid plan with 2 added and 1 removed event is applied
- **THEN** both additions exist, the removed event is `deprecated`, and the response reports the applied counts

#### Scenario: Bad plan rejected whole

- **WHEN** a plan's `modified` references an event the tenant does not have
- **THEN** the API responds 409 and the registry is unchanged

### Requirement: Append-only audit trail

Every registry mutation (create, apply-plan, deprecate) SHALL append an audit record — tenant, actor, timestamp, operation, and the entry diff — that can be listed per tenant in reverse chronological order. Audit records SHALL never be updated or deleted by the API.

#### Scenario: Mutations audited

- **WHEN** a tenant applies a tracking plan
- **THEN** the audit log gains one record per affected entry, listing shows them newest-first, and no API route exists to alter them

### Requirement: Tenant isolation and bearer auth

Every request except health SHALL carry a tenant-scoped bearer token. Tokens SHALL be verified against stored hashes (never stored in clear). A tenant's token SHALL NOT read or mutate another tenant's registry or audit log.

#### Scenario: Cross-tenant access impossible

- **WHEN** tenant A's token requests tenant B's registry (any route shape)
- **THEN** the API responds 404 or 403 and no tenant-B data is returned

#### Scenario: Missing or invalid token

- **WHEN** a request carries no token or an unknown token
- **THEN** the API responds 401

### Requirement: Health endpoint

`GET /health` SHALL respond 200 without auth, reporting service and database reachability truthfully (no hardcoded "ok" when the database is down).

#### Scenario: Degraded database reported

- **WHEN** the database is unreachable
- **THEN** `/health` reports the database as down (non-200 or explicit degraded status), not a fake ok

### Requirement: Seam-map storage

The service SHALL store, per tenant and repo, the instrumentation agent's seam map (framework, seams with `file:line` anchors, task taxonomy, agent version that produced it) and return the latest map on request. Seam-map writes SHALL append to the audit trail like every other mutation.

#### Scenario: Seam map round-trip

- **WHEN** an agent run stores a seam map for repo `acme/sdr-agent` and a later run requests it
- **THEN** the latest map is returned with its produced-at metadata, and the write appears in the audit log

#### Scenario: Tenant isolation extends to seam maps

- **WHEN** tenant A's token requests tenant B's seam map
- **THEN** the API responds 404 or 403 and no tenant-B data is returned

### Requirement: Token management routes

The service SHALL support issuing additional tenant tokens with a scope (`events:write` | `api:full`), listing active tokens (prefixes only — never full values), and revoking a token by id. Every token operation appends to the audit trail.

#### Scenario: Issue, list, revoke

- **WHEN** a tenant issues a scoped token, lists tokens, and revokes the original
- **THEN** the list shows both by prefix and scope, the revoked token 401s immediately, and all three operations appear in the audit log

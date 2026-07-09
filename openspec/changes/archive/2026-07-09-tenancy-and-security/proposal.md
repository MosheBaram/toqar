# Tenancy and Security

## Why

We hold customers' source context (seam maps), their event streams, and soon their findings — cross-tenant leakage is existential, not a compliance checkbox. Change 1.1 laid groundwork (hashed tokens, tenant-scoped routes, adversarial isolation tests); this change hardens isolation at every layer as the other changes add layers, and starts the SOC 2 evidence trail while it is cheap.

## What Changes

- Postgres row-level security on every tenant-scoped table (defense in depth under the application checks).
- ClickHouse tenant scoping enforced structurally in the semantic layer (no product query without a bound tenant parameter).
- Token lifecycle: rotation and revocation without downtime; scoped tokens for SDK-only vs full API access.
- Cross-service adversarial isolation suite: one test package that attacks every surface (registry API, collector, MCP, web API) with wrong-tenant credentials.
- SOC 2 Type 1 track: control checklist in-repo, evidence collection wired into what already exists (audit logs, CI history, access records).

## Capabilities

### New Capabilities

- `tenancy` — isolation guarantees and token lifecycle across all services.
- `security-controls` — audit coverage, encryption posture, SOC 2 evidence discipline.

### Modified Capabilities

- `registry-backend` — token rotation/revocation and scoped tokens (additive requirements).

## Impact

- Cross-cutting: touches registry-service, collector (1.3), analysis (1.4), web/MCP (1.5) as each lands — tasks are sequenced to follow those changes rather than block them.
- No new product surface; the deliverable is guarantees plus their proof.

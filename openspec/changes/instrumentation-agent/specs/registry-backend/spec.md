# registry-backend Specification (delta)

## ADDED Requirements

### Requirement: Seam-map storage

The service SHALL store, per tenant and repo, the instrumentation agent's seam map (framework, seams with `file:line` anchors, task taxonomy, agent version that produced it) and return the latest map on request. Seam-map writes SHALL append to the audit trail like every other mutation.

#### Scenario: Seam map round-trip

- **WHEN** an agent run stores a seam map for repo `acme/sdr-agent` and a later run requests it
- **THEN** the latest map is returned with its produced-at metadata, and the write appears in the audit log

#### Scenario: Tenant isolation extends to seam maps

- **WHEN** tenant A's token requests tenant B's seam map
- **THEN** the API responds 404 or 403 and no tenant-B data is returned

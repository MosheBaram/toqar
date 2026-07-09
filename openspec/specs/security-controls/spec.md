# security-controls Specification

## Purpose

Audit coverage, encryption posture, SOC 2 evidence discipline, and
operator access reviews — the guarantees plus their proof.

## Requirements

### Requirement: Audit coverage across services

Every mutation on every service SHALL append an audit record (actor, tenant, operation, diff or payload ref, timestamp) following the registry-backend pattern; audit stores are append-only with no API mutation path.

#### Scenario: New service inherits the discipline

- **WHEN** the collector's tenant configuration changes
- **THEN** an audit record exists for the change with actor and timestamp

### Requirement: Encryption posture

All external traffic SHALL be TLS; data at rest (Postgres, ClickHouse, backups) SHALL be encrypted; secrets SHALL live in environment/secret storage, never in the repo — enforced by a CI secret-scan gate.

#### Scenario: Secret scan gates

- **WHEN** a commit introduces a string matching credential patterns
- **THEN** CI fails before merge

### Requirement: SOC 2 evidence discipline

A control checklist (Type 1 scope: access control, change management, audit logging, backup/recovery, vendor inventory) SHALL live in-repo with each control mapped to its evidence source (CI history, protected-branch config, audit tables, backup logs). The checklist SHALL be reviewed and updated as part of each change's close-out, not reconstructed later.

#### Scenario: Evidence stays current

- **WHEN** a change adds a service
- **THEN** its close-out updates the checklist rows the service affects (access, audit, backup)

### Requirement: Access reviews

Operator access (repo, VM, databases, Anthropic/Slack credentials) SHALL be inventoried with a recorded review cadence; departures/rotations update the inventory the same day.

#### Scenario: Inventory truthful

- **WHEN** the quarterly review runs
- **THEN** every listed credential maps to a current operator and purpose

# stream-pipeline Specification

## ADDED Requirements

### Requirement: Events land queryable within seconds

Accepted events SHALL flow Redpanda → ClickHouse and be queryable in the tenant-scoped events table within seconds under normal load.

#### Scenario: Freshness

- **WHEN** an event is accepted by the collector
- **THEN** it is returned by a ClickHouse query for its tenant within 10 seconds

### Requirement: Near-exactly-once via event_id idempotency

Redelivery or consumer restart SHALL NOT produce duplicate rows in query results: deduplication keys on `event_id` (engine-level dedup plus query-time guarantees documented and tested).

#### Scenario: Redelivered batch

- **WHEN** the same batch is delivered to the sink twice
- **THEN** per-`event_id` counts in query results remain 1

### Requirement: Tenant scoping in storage

Every stored event row SHALL carry its tenant id, and no query path used by the product SHALL read across tenants without the benchmarking opt-in (Phase 2).

#### Scenario: Scoped table

- **WHEN** tenant A's metrics query runs
- **THEN** its SQL filters on tenant A's id by construction

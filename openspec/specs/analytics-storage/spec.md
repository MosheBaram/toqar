# analytics-storage Specification

## Purpose

The ClickHouse storage contract for the analytics data plane: query-aligned
keys, typed hot columns, codecs, partitioning, incremental rollups,
dedup/`FINAL` strategy, data lifecycle (TTL, tiered storage, per-tenant
retention and deletion), and replication/recoverability.

## Requirements

### Requirement: Query-aligned sort key and typed hot columns

The events table SHALL order rows by the columns the metrics filter on (tenant, then task_type/event, then time), not by a random identifier, so the primary index serves the TOQAR query patterns. The fields the semantic layer reads on the hot path (at minimum: cost, tokens in/out, latency, tool name, model, step status/error, verification, feedback rating, edit magnitude) SHALL be stored as typed columns (materialized from the payload where needed), not parsed from a JSON string at query time. The raw payload MAY be retained for the long tail of properties.

#### Scenario: Metric queries use the primary index

- **WHEN** a metric filters by tenant, task_type, and a time window
- **THEN** the query is served by the sort key/primary index (no full-partition scan of unrelated data), and hot fields are read from typed columns rather than JSON extraction

#### Scenario: Numbers are unchanged

- **WHEN** the existing metric test suite runs against the new schema
- **THEN** every metric returns the same value it did before (this is a substrate change; results and `q_<hash>` citations are unchanged)

### Requirement: Compression and partitioning tuned for time-series events

The events table SHALL apply column compression codecs appropriate to each column (delta-family on timestamps, a general codec such as ZSTD on the payload, integer codecs on numeric metrics) and SHALL partition on a granularity that avoids the "too many parts" failure at multi-tenant scale (monthly rather than daily).

#### Scenario: Storage is compressed and partitions are bounded

- **WHEN** the schema is created
- **THEN** timestamp/numeric/payload columns carry explicit codecs and the partitioning granularity is coarser than one partition per day

### Requirement: Deduplication without per-query FINAL cost

Redelivery-safe exactly-once semantics SHALL be preserved, but correctness SHALL NOT depend on an unbounded `FINAL` merge on every read. The design SHALL bound `FINAL` cost (e.g. partition-local final, or insert/partition-level dedup, or serving reads from deduplicated projections/materialized views).

#### Scenario: Reads stay correct under redelivery without unbounded merge cost

- **WHEN** an event is delivered more than once and a metric is then computed
- **THEN** the metric counts it once, and the read does not pay a full cross-partition merge

### Requirement: Incremental rollups via materialized views/projections

Common cross-cutting rollups (e.g. per-tenant/day merge rate, task success rate, cost per completed task) SHALL be served from incrementally-maintained materialized views or projections rather than recomputed from raw events on every request, while remaining reconcilable to the raw events.

#### Scenario: A rollup reconciles to raw events

- **WHEN** a rollup served from a materialized view is compared to the same aggregate computed from raw events
- **THEN** the two agree (the view is a cache, not a separate source of truth)

### Requirement: Retention, tiered storage, and per-tenant deletion

The events store SHALL support data lifecycle: a TTL/tiered-storage policy moving cold data from hot disk to object storage, a configurable per-tenant retention window, and a per-tenant deletion path that actually removes a tenant's rows (supporting right-to-be-forgotten). No data lifecycle operation SHALL silently corrupt metric reproducibility for retained windows.

#### Scenario: A tenant's data can be deleted

- **WHEN** a tenant deletion is requested
- **THEN** that tenant's events are removed from the store and no longer appear in any query or rollup

#### Scenario: Cold data tiers out

- **WHEN** data ages past the hot window
- **THEN** it moves to the configured cold/object tier and remains queryable

### Requirement: Replication and recoverability

The events store SHALL be deployable as a replicated table (ReplicatedMergeTree + coordination) so a single node loss is not data loss, and SHALL have a documented, tested backup/point-in-time-recovery procedure.

#### Scenario: Replication is available and backups are proven

- **WHEN** the store is deployed for production
- **THEN** the table engine replicates across nodes and a restore-from-backup procedure has been exercised

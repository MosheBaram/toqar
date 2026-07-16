# Data-Plane Hardening

## Why

The control plane (Postgres) is production-grade, but the analytics data plane
(ClickHouse + Redpanda) is tuned for correctness-by-dedup and demo scale, not
for efficiency, reliability, or performance at customer scale (see
`docs/reviews/2026-07-16-platform-review.md`). Concretely, in the current code:

- The events table sorts by `(tenant_id, event_id)` — a random UUID in the sort
  key, so the primary index cannot serve the tenant+time+task_type queries the
  metrics actually run (`packages/pipeline/src/clickhouse.ts`,
  `packages/analysis/src/semantic.ts`).
- Every hot field (cost, tokens, latency, tool, model, verification, rating) is
  parsed from a JSON `payload` string on every metric read (`semantic.ts`).
- Every read uses `FINAL` (merge-at-query) on a `ReplacingMergeTree`.
- Daily partitions; no compression codecs; no TTL / tiered storage / retention;
  no per-tenant deletion (a GDPR gap); no materialized views/projections; single
  node (not `ReplicatedMergeTree`); the producer is not idempotent and sets no
  explicit `acks`; there is no dead-letter path.
- **RLS is built but disengaged on the served path**: `tenantTransaction` exists
  and is tested, but no product code calls it — every store method runs on the
  owner connection (which bypasses RLS) with app-level scoping only, so the
  documented "two layers" of isolation is one layer in practice.
- The collector can **acknowledge-then-drop** (202 then buffer-overflow loss on
  a sustained outage), and the citation log does a **single-row insert on every
  metric read** (write-on-read amplification, parts hazard, unbounded growth).

This change makes persistence "extremely efficient and reliable while
performant" — the founder's explicit bar — as a sequenced, mostly-additive
hardening of the storage substrate and the stream.

## What Changes

- **ClickHouse storage contract (new capability `analytics-storage`).** A
  query-aligned sort key; typed/materialized hot columns for the fields metrics
  read; compression codecs (Delta/DoubleDelta on time, ZSTD on payload, T64 on
  numerics); monthly partitioning; incremental **materialized views /
  projections** for the common rollups; **`FINAL`-cost controls**; **TTL +
  tiered storage** (hot disk → object storage) and **per-tenant retention +
  deletion**; **`ReplicatedMergeTree` + Keeper** for HA and backups/PITR.
- **Stream durability (modify `stream-pipeline`).** Idempotent producer with
  `acks=all`; a documented offset/effectively-once contract for the ClickHouse
  sink; a **dead-letter path** for unmappable/failed messages (no silent drop);
  topic retention + tiered storage.
- **Control-plane reliability (modify `tenancy`/security posture).** Engage RLS
  on the served path (route tenant-scoped store methods through
  `tenantTransaction`, `FORCE ROW LEVEL SECURITY`, non-owner service role);
  rewrite policies to the once-per-statement initPlan form; documented Postgres
  backups/PITR and connection pooling.

The semantic layer keeps its exact numbers and citation contract — this is a
substrate change beneath it, validated by the same metric tests and the
docker-compose integration job.

## Capabilities

### New Capabilities

- `analytics-storage` — the ClickHouse storage contract: engine, keys, typed
  columns, codecs, partitioning, projections/materialized views, dedup/`FINAL`
  strategy, replication/HA, and retention/tiered-storage/deletion.

### Modified Capabilities

- `stream-pipeline` — idempotent/durable producer, effectively-once sink offset
  contract, dead-letter path, no acknowledge-then-drop, topic retention/tiered
  storage.
- `tenancy` — the RLS net is engaged on the served path (tenant-bound sessions,
  `FORCE ROW LEVEL SECURITY`, non-owner service role, initPlan policies,
  fail-closed tenant context).

## Impact

- Data plane only; the semantic layer, findings, and citations are unchanged in
  behavior — same metric results, cheaper and more reliably. Schema evolution is
  migration-based (the events table is versioned like the Postgres migrations).
- Depends on the shipped pipeline + analysis packages. Every change is exercised
  by the real-pipe integration CI job before it ships.
- Sequenced cheap-high-leverage first (keys/codecs/typed columns → projections →
  TTL/tiered/retention/deletion → replication/HA → producer durability + DLQ),
  so value lands incrementally without a big-bang migration.

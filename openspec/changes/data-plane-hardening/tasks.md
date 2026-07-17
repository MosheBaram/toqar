# Tasks — Data-Plane Hardening

> Substrate change beneath the semantic layer. The metric test suite and the
> docker-compose integration job are the regression guard: every step must keep
> all 21 metrics returning identical values. Sequenced cheap-high-leverage
> first. Each group ships through branch → PR → CI (incl. integration) → merge.

## 1. Schema: keys, typed hot columns, codecs, partitioning (spec: analytics-storage)

- [x] 1.1 New events-table schema version: sort key `(tenant_id, task_type, event, timestamp)` (dedup identity preserved without leading on `event_id`); typed/materialized hot columns (cost_usd, tokens_in/out, latency_ms, tool_name, model, step status/error, verification, rating value, edit magnitude); retain `payload` for the long tail
- [x] 1.2 Column codecs (delta-family on timestamp, ZSTD on payload, integer codec on numerics); monthly `PARTITION BY`
- [x] 1.3 Migrate `toRow`/transform to populate typed columns; update the semantic layer to read typed columns instead of `JSONExtract` on the hot path — assert metric results unchanged (byte-for-byte against fixtures)
- [x] 1.4 Versioned, append-only ClickHouse migration (mirror the Postgres migration discipline); integration test covers create + backfill
- [x] 1.5 Commit, PR, merge

## 2. Dedup without per-query FINAL + incremental rollups (spec: analytics-storage)

- [x] 2.1 Bound `FINAL` cost (partition-local final / insert-level dedup / serve from deduped projection) — TDD redelivery still counts once
- [x] 2.2 Materialized views/projections for the common rollups (per-tenant/day merge rate, TSR, cost per completed task); reconcile-to-raw test
- [x] 2.3 Point the operator rollups + hot dashboard reads at the views where they reconcile
- [x] 2.4 Commit, PR, merge

## 3. Retention, tiered storage, per-tenant deletion (spec: analytics-storage)

- [ ] 3.1 TTL + tiered-storage policy (hot disk → object storage), configurable per-tenant retention window
- [ ] 3.2 Per-tenant deletion path (right-to-be-forgotten): removes the tenant's rows from events + views; integration test asserts the tenant vanishes from every query/rollup
- [ ] 3.3 `executed_queries` retention (citation log TTL) that preserves reproducibility within the retained window
- [ ] 3.4 Commit, PR, merge

## 4. Stream durability (spec: stream-pipeline delta)

- [ ] 4.1 Idempotent producer + `acks=all` on the collector's Redpanda sink; TDD retry-does-not-duplicate
- [ ] 4.2 Sink commits offsets only after a durable ClickHouse write; TDD crash-before-commit re-processes not skips (effectively-once via dedup)
- [ ] 4.3 Dead-letter path for unmappable/failed messages with reason; observable count; no silent drop
- [ ] 4.4 Fix acknowledge-then-drop: `BufferedSink` overflow spills durably (disk/DLQ replay) or applies backpressure instead of counting drops; TDD outage-past-capacity loses nothing acked
- [ ] 4.5 Batch/async the `executed_queries` citation writes (no single-row insert per metric read — write-on-read amplification + parts hazard)
- [ ] 4.6 Explicit topic retention + tiered-storage config (documented for deployment)
- [ ] 4.7 Commit, PR, merge

## 5. RLS engagement + replication/HA + control-plane reliability (specs: tenancy delta, analytics-storage)

- [ ] 5.1 Engage RLS on the served path: route every tenant-scoped `RegistryStore` method through `tenantTransaction`; `FORCE ROW LEVEL SECURITY` on tenant tables; production service connects as a non-owner, non-BYPASSRLS role; isolation suite re-run proves both layers active (operator plane stays owner-run by design)
- [ ] 5.2 Rewrite RLS policies to the initPlan form `(SELECT current_setting('app.tenant'))`; composite indexes lead with `tenant_id`; fail-closed on unset GUC
- [ ] 5.3 `ReplicatedMergeTree` + coordination (Keeper) deployment path; documented backup/PITR procedure, exercised once
- [ ] 5.4 Postgres backups/PITR + connection pooling documented (PgBouncer transaction mode; `SET LOCAL`-only tenant context)
- [ ] 5.5 `openspec validate --strict`; full gates + integration green; commit, PR, merge

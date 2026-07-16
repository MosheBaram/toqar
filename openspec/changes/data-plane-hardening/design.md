# Design — Data-Plane Hardening

Grounded in `docs/research/2026-07-16-data-persistence.md` (cited best practices,
current as of mid-2026) and `docs/reviews/2026-07-16-platform-review.md`. Every
choice below has a source in the research doc.

## The through-line

Don't chase end-to-end exactly-once. Mint a stable `event_id` at the collector,
run the whole path at-least-once with an **idempotent producer**, and let
ClickHouse converge duplicates by `event_id`. This is the confirmed industry
pattern and sidesteps every distributed-transaction caveat (a Kafka transaction
can't extend into the ClickHouse write anyway).

## Decisions

### D1: Query-aligned sort key + typed hot columns

`ORDER BY (tenant_id, task_type, event, timestamp)`. Every Toqar query filters by
tenant, so `tenant_id` must lead (a deliberate deviation from cardinality-ascending
ordering, justified by the query pattern; it also physically clusters each
tenant's data, maximizing compression). Keep `index_granularity = 8192`. Promote
the hot fields the semantic layer reads (`cost_usd`, `tokens_in/out`,
`latency_ms`, `tool_name`, `model`, step `status`/`error`, `verification`,
feedback `rating`, `edit_magnitude`) to typed columns — `LowCardinality(String)`
for enum-like strings, `UInt32` for counters — instead of `JSONExtract` on every
read. Keep `payload` for the long tail. **Metric results must not change** — the
existing test suite is the guard.

### D2: Dedup without unbounded FINAL

Keep `ReplacingMergeTree(ver)` keyed on `(…, event_id)` for row convergence, add
`insert_deduplication_token` per batch (block-level idempotency on Replicated
tables), and at the query layer follow the benchmarked rule: **filter keeps >50%
of data → `FINAL`; selective (≤50%) → fold dedup into the `GROUP BY` with
`argMax(col, ver)`**. On modern ClickHouse (≥23.3; auto cross-partition decision
default in 26.2) `FINAL` on selective lookups is production-acceptable; the
semantic layer should stop paying blanket `FINAL` on aggregations that already
group.

### D3: Codecs + monthly partitions

Per-column codecs: `DoubleDelta, ZSTD(1)` on regular timestamps (`Delta` if
arrival is irregular), `T64, ZSTD(1)` on token/latency integers, `ZSTD(1)`
directly on `payload`/high-entropy text (no specialized codec — it hurts),
`LowCardinality` for enum-like. `PARTITION BY toYYYYMM(timestamp)` (~12/yr, keeps
part-count sane and aligns with TTL). **Never** partition by `tenant_id` (blows
the part limit). Realistic footprint reduction: ~60% end-to-end in the cited
tuning.

### D4: Incremental MVs into AggregatingMergeTree (not projections)

Serve the 21 metrics/rollups from **incremental materialized views** writing
partial aggregate states (`sumState`, `countState`, `uniqState`,
`quantileTDigestState`) into a few *wide* `AggregatingMergeTree` targets sharing
grain `(tenant_id, task_type, tool, bucket)`; reads use `-Merge`. The MV's
`GROUP BY` must match the target's `ORDER BY`. Reserve projections for a single
off-key drill-down. Rollups remain reconcilable to raw events (a view is a cache,
not a second source of truth) — enforced by a reconcile test.

### D5: Lifecycle — TTL, tiered storage, per-tenant retention & deletion

`TTL timestamp + INTERVAL … DELETE` with `ttl_only_drop_parts = 1` (drop whole
partitions, not row rewrites). No native per-tenant TTL exists → a per-row
`retention_days` column derived from the tenant's plan drives
`TTL timestamp + INTERVAL retention_days DAY`. Right-to-be-forgotten deletion uses
a targeted delete of the tenant's rows (lightweight delete / partition ops).
Tiered storage (at scale): `TO VOLUME` hot-NVMe→cold-S3; **never set an S3 bucket
lifecycle rule** (ClickHouse owns object lifecycle) and watch local
metadata-disk exhaustion.

### D6: Durability & HA

Redpanda producer `acks=all` + `enable.idempotence=true`, RF=3,
`cleanup.policy=delete`, retention ≥ the ClickHouse restore window (the practical
PITR backstop, since ClickHouse has no continuous WAL). Ingest via an external
batching consumer (Vector or custom) → `ReplicatedMergeTree`, 10k–100k rows/insert
~1/s, **commit offsets only after the write** (crash re-processes, dedup makes it
effectively-once). Unmappable/failed → dead-letter path. HA: `ReplicatedMergeTree`
+ 2 replicas + a 3-node Keeper quorum. Backups: native `BACKUP … TO S3`
incrementals; PITR = frequent incrementals + replay from Redpanda's committed
offset.

### D7: Engage RLS on the served path + Postgres control-plane reliability

The review's second pass found that **RLS is built but disengaged**:
`tenantTransaction` (correct `SET LOCAL ROLE` + transaction-scoped
`set_config`) exists in both bindings and is tested, but no product code calls
it — every `RegistryStore` method runs on the base owner connection, which
bypasses RLS entirely. The fix, in order:

- **Route every tenant-scoped store method through `tenantTransaction`** so the
  non-owner `toqar_app` role + `app.tenant` GUC actually bind on the served
  path. App-level `WHERE tenant_id` stays (defense-in-depth becomes real).
  The operator plane deliberately stays owner-run — unchanged.
- Rewrite policies to the initPlan form — `(SELECT current_setting(...))`
  instead of bare `current_setting(...)` — a benchmarked **~11,000ms → ~10ms**
  at scale; keep composite indexes leading with `tenant_id`.
- Add `ALTER TABLE … FORCE ROW LEVEL SECURITY` and connect the service as a
  **non-owner, non-BYPASSRLS** role in production.
- Pooling: only `SET LOCAL` / `set_config(…, true)` for tenant context (already
  the case), because a bare `SET` leaks across PgBouncer transaction-pooled
  connections. Fail closed on unset GUC:
  `NULLIF(current_setting('app.tenant', true), '')`.

## Sequencing (cheap-high-leverage first)

Keys/codecs/typed columns/partitions → dedup-without-FINAL + MVs → TTL/tiered/
retention/deletion → producer durability + DLQ → replication/HA + Postgres RLS
hardening. Each is migration-based and guarded by the metric suite + the
docker-compose integration job. Cloud-vs-self-managed (SharedMergeTree, tiered
storage) is a deployment decision deferred to the operator; the code and schema
support both.

## Risks / Trade-offs

- [Schema migration on a live events table] → versioned append-only ClickHouse
  migrations mirroring the Postgres discipline; backfill + reconcile tests; the
  metric suite proves numbers are unchanged.
- [MV targets are eventually-merged] → reads `-Merge`/`FINAL`; reconcile-to-raw
  test keeps them honest.
- [Version sensitivity] → the research flags exact version gates (FINAL cheapness
  ≥23.3, part limits ≥23.6, async adaptive ≥24.2, BACKUP ≥22.11); pin/verify
  against the deployed build. Two items are data-dependent, not version-dependent
  — benchmark on our own data: Gorilla-vs-ZSTD on `latency_ms`, and the
  argMax-vs-FINAL selectivity cutoff.

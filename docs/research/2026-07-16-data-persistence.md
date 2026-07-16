# Toqar Data Persistence: Deep Technical Recommendations (research current as of mid-2026)

Scope: ClickHouse (analytics), Redpanda (stream), Postgres (control plane). Every non-obvious claim carries a source URL. Version-sensitive items are flagged. Baseline assumption: recent ClickHouse (24.x+/25.x/26.x), Redpanda 25.x/26.x, Postgres 17/18.

**The one architectural through-line:** don't chase end-to-end exactly-once. Mint a stable `event_id` at the collector, run the whole path at-least-once with an idempotent producer, and make ClickHouse converge duplicates by `event_id`. This is confirmed as the pragmatic industry standard and sidesteps every distributed-transaction caveat below.

---

## PART A — CLICKHOUSE

### A1. Table engine choice + dedup / exactly-once

**Raw events table → plain `MergeTree`.** Events are immutable facts; you rarely want the engine silently collapsing rows. Reserve specialized engines for cases where their merge semantics exactly match the write pattern. Dedup/aggregation in the *Replacing/Summing/Aggregating* engines happens only during background merges, per partition, and is never guaranteed complete at read time — so picking a fancy engine does not free you from query-time reconciliation.
- ReplacingMergeTree — last-write-wins on a key; slowly-changing dims, late corrections/re-ingested `event_id`. Needs `ver` (and optional `is_deleted`, which only works when `ver` is set).
- SummingMergeTree — you only ever need sums per key (pure counters). Simpler but sums-only.
- AggregatingMergeTree — arbitrary aggregate states (uniq, quantile, argMax); strict superset of Summing. This is your rollup/MV target engine.
- Sources: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree , https://clickhouse.com/docs/guides/developer/deduplication

**Dedup is two independent layers — use both, they're complementary:**

1. **Insert-block dedup (ingestion idempotency).** On `Replicated*MergeTree` this is ON by default: each inserted block is hashed; a re-inserted identical block is skipped. Controlled by `replicated_deduplication_window` (default **100** blocks) and `replicated_deduplication_window_seconds` (default **604800** = 7 days), stored in Keeper per partition. Set `insert_deduplication_token = <deterministic batch id>` (e.g. Redpanda topic-partition-offset-range) so producer retries are free and safe even with a `DEFAULT now()` column. To propagate into MV targets you need `insert_deduplicate=1` **plus** `deduplicate_blocks_in_dependent_materialized_views=1`. Limitation: finite window; replays older than 7 days / 100 blocks slip through, and inserts to different replicas can still duplicate. Sources: https://clickhouse.com/docs/guides/developer/deduplicating-inserts-on-retries , https://kb.altinity.com/altinity-kb-schema-design/insert_deduplication/

2. **Row-level convergence (ReplacingMergeTree).** Store events in `ReplacingMergeTree(ver)` with `ORDER BY (tenant_id, …, event_id)`. Duplicates that escape the insert window (late replays, cross-shard) converge at merge. This is the robust layer; the block-dedup above is fragile (depends on identical block boundaries).

3. **App-level `event_id` dedup** is the only way to get true global uniqueness across shards and arbitrary time windows — ClickHouse has no cheap built-in row-uniqueness constraint. Do this at scale, not now. Source: https://kb.altinity.com/altinity-kb-schema-design/row-level-deduplication/

**FINAL query-time cost — version-sensitive, and the news is good.** FINAL was historically a "100ms → 10s" trap, but a long optimization chain fixed most of it: 22.6 parallelism, 22.8 stops over-reading, 23.3+ only necessary partitions, 23.9 skips PK columns when one part/partition, 23.12 dedup only on intersecting ranges, 24.1 `enable_vertical_final=1` (default). `do_not_merge_across_partitions_select_final=1` gave Altinity a **3.31s → 1.85s (~44%)** win on 50M rows (but historically mis-filtered `is_deleted` — verify on your version, GitHub #49685). **26.2** adds `enable_automatic_decision_for_merging_across_partitions_for_final=1` (default on) so you often get that win automatically. Net: on modern versions FINAL is production-acceptable for **narrow, selective** queries. Sources: https://kb.altinity.com/altinity-kb-queries-and-syntax/altinity-kb-final-clause-speed/ , https://clickhouse.com/docs/changelogs/26.2

**argMax / GROUP BY as the FINAL alternative — biggest lever.** When a query already needs a GROUP BY, fold dedup into it: `argMax(col, ver)` picks the latest value per key in one pass. Benchmarked decision rule (Insider Engineering): **filter removes >50% of data → use FINAL; ≤50% (selective) → use argMax.** Caveat: argMax does NOT understand `is_deleted` — carry it through as `argMax(is_deleted, ver)` and filter in HAVING yourself; watch memory on wide low-selectivity scans. Sources: https://medium.com/insiderengineering/clickhouse-query-optimization-argmax-vs-final-50c710a1a7f3 , https://clickhouse.com/docs/guides/developer/deduplication

Benchmark reference (Insider Engineering, argMax vs FINAL by selectivity = fraction of data remaining after WHERE):

| Selectivity (data remaining) | argMax | FINAL |
|---|---|---|
| 0.92 (broad scan) | 880 GB / 1006 s | **98 GB / 511 s** |
| 0.71 | 40 GB / 30 s | **1.2 GB / 8 s** |
| 0.10 (very selective) | **111 GB / 89 s** | 5.4 GB / 109 s |

**Recommended pattern (do now):** raw events in `ReplacingMergeTree(ver)` keyed on `(tenant_id, …, event_id)` + `insert_deduplication_token` per batch on Replicated tables + query selective lookups with FINAL, and `argMax` wherever you're already grouping. **At scale:** add `is_deleted` + scheduled `OPTIMIZE … FINAL CLEANUP` (`allow_experimental_replacing_merge_with_cleanup`) and `min_age_to_force_merge_seconds`; shard by the dedup key so convergence holds; add app-level `event_id` dedup for guarantees beyond the window.

### A2. Schema / ORDER BY / primary key

**Concrete ORDER BY for the single shared table:**
```sql
ORDER BY (tenant_id, task_type, event_type, timestamp)   -- do now
-- at scale, bucket time to cut exclusion-search cardinality:
ORDER BY (tenant_id, task_type, event_type, toStartOfHour(timestamp), timestamp)
```
**Why:** the first key column is resolved by binary search (precise granule pruning); later columns use generic exclusion search that only works when the *predecessor* is lower-cardinality. Every Toqar query filters by tenant, so `tenant_id` must lead — this is a deliberate deviation from strict cardinality-ascending ordering, justified by the query pattern and by physically clustering each tenant's data (which also maximizes compression). ClickHouse's own observability guidance is the same shape: entity-then-time (`ORDER BY (Service, Timestamp)`). Ordering alone can swing a column's compression 3:1 → 39:1. Do NOT lead with `timestamp` or any per-call UUID. Keep default `index_granularity = 8192` (whole primary index stays tiny/memory-resident, e.g. ~97KB for 8.87M rows). At scale, enable `optimize_row_order = 1` to cluster non-key columns by cardinality during INSERT for extra compression. Sources: https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes , https://clickhouse.com/resources/engineering/observability-cost-optimization-playbook , https://clickhouse.com/resources/engineering/clickhouse-query-optimisation-definitive-guide

**LowCardinality vs Enum.** Use `LowCardinality(String)` for `task_type, event_type, tool_name, model_name` and `LowCardinality(UInt8)` for the `error` flag. Dictionary encoding is efficient **below ~10k distinct values** and can regress **above ~100k** (dictionary/index widths grow) — so if tenant count crosses ~100k, revert `tenant_id` to a plain type. Note the dictionary is per-part/block, so a column with high global but low per-block cardinality (because clustered by ORDER BY) still benefits. Prefer LowCardinality over Enum8/Enum16: Enum is 1–2 bytes and most compact but the value set is frozen at DDL (a new tool/model needs an `ALTER … MODIFY COLUMN` and unknown values error on insert). ClickHouse explicitly recommends LowCardinality over Enum for evolving string sets; reserve Enum for truly frozen sets (e.g. a 3-value severity). Sources: https://clickhouse.com/docs/sql-reference/data-types/lowcardinality , https://clickhouse.com/blog/10-best-practice-tips

### A3. Compression codecs

Defaults: **LZ4 self-managed, ZSTD(1) on Cloud.** Set per-column via `CODEC(...)`; chain specialized-transform-then-general-compressor (`CODEC(Delta, ZSTD(1))`; evaluated left-to-right on write, right-to-left on read). ZSTD(1) ≈ ZSTD(3); **ZSTD(3) is the practical ceiling** — ZSTD(9→19) adds only 3–5% while halving decompression to 0.3–1 GB/s (cold/archival only).

| Column | Codec | Why |
|---|---|---|
| `timestamp` (regular) | `CODEC(DoubleDelta, ZSTD(1))` | delta-of-delta ≈ 0 for uniform increments; a date field hit 166× |
| `timestamp` (irregular arrival) | `CODEC(Delta, ZSTD(1))` | single Delta safer for non-uniform gaps (2.24 GiB → 24 MiB in blog) |
| monotonic counters/IDs | `CODEC(Delta, ZSTD(1))` or `CODEC(Delta, T64, ZSTD)` | residuals pack to single bytes |
| `tokens_in`/`tokens_out` (UInt32) | `CODEC(T64, ZSTD(1))` | T64 bit-packs a 64-int block by truncating unused high bits (~25% on ints) |
| `latency_ms` | store as `UInt32` ms + `CODEC(T64, ZSTD(1))`; if float, **benchmark Gorilla vs ZSTD** | ClickHouse's own tests found plain ZSTD beat Gorilla on Float32 — don't assume Gorilla |
| `error` flag (UInt8/bool) | `LowCardinality(UInt8)` or default | 2 distinct values, trivially compressible |
| enums / `tool_name` / `model_name` | `LowCardinality(String)` (dictionary, then LZ4/ZSTD) | see A2 |
| high-entropy text (prompts, JSON) | `String CODEC(ZSTD(1))` — no specialized codec | specialized codecs hurt random text; "CPU cost outpaces I/O savings" |

Realistic ratios: 5–10× analytical, 30×+ on low-cardinality columns; end-to-end schema+codec tuning in the blog dropped compressed footprint 4.07 GiB → 1.42 GiB (−63%); production reports 15–20× (Character.AI), observability tiering ~50% immediate storage reduction and 2–5× better than Lucene systems. The 2026 observability playbook's default policy: Delta/DoubleDelta+ZSTD(1) for timestamps/counters, ZSTD(1) directly for text, LowCardinality (no extra codec) for enums, `ZSTD(1)` throughout, `optimize_row_order = 1`, and for high-throughput out-of-order agent ingestion *don't* pre-sort on the client — rely on ClickHouse's part-level sort/merge. Sources: https://clickhouse.com/resources/engineering/database-compression , https://clickhouse.com/blog/optimize-clickhouse-codecs-compression-schema , https://clickhouse.com/resources/engineering/observability-cost-optimization-playbook , https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy

Version note: Delta/DoubleDelta/Gorilla/T64 have been stable for years; the Gorilla-vs-ZSTD outcome is *data-dependent*, not version-dependent — always benchmark on your own data.

### A4. Materialized views / projections for the 21 metrics

**Use incremental MVs into AggregatingMergeTree targets, not projections.** An incremental MV is an insert trigger: it runs `SELECT … GROUP BY` on just the new block and writes partial aggregate states to a separate target (docs example: 238M rows → ~5,700 aggregated rows, ~25× query speedup). Pattern: target = `AggregatingMergeTree` (or `SummingMergeTree` for pure sums/counts); MV writes `-State` (`sumState`, `countState`, `uniqState`/`uniqExactState`, `quantileTDigestState(0.99)`, `avgState`); reads use `-Merge` + `GROUP BY` the ordering key (or FINAL). **Hard rule: the MV's GROUP BY must match the target's ORDER BY.** Collapse the 21 metrics into a few *wide* targets sharing grain `(tenant_id, task_type, tool, bucket)` rather than 21 separate tables; bucket at your finest useful granularity (`toStartOfHour`/`toStartOfDay`); target `ORDER BY (tenant_id, task_type, tool, bucket)` so per-tenant reads prune immediately; chain MVs for day→month rollups; serve dashboards from targets. Sources: https://clickhouse.com/docs/materialized-view/incremental-materialized-view , https://clickhouse.com/docs/managing-data/materialized-views-versus-projections

Projections are transparent (optimizer picks them, no query change, `MATERIALIZE PROJECTION` to backfill) but can't span multiple grouping combinations or JOIN/denormalize, tax every insert, and store an extra in-table copy. Use one only as a targeted add-on for a single off-key drill-down (e.g. per-tool failure rate that doesn't lead with tenant). Version notes: `lightweight_mutation_projection_mode` (v24.7+) makes projections tolerate lightweight-deleted rows; multi-projection filtering landed v25.6+. Tradeoff accepted: MV targets are eventually-merged, so reads must `-Merge`/`FINAL`, and a metric schema change means altering target+MV (more ops than a transparent projection).

### A5. Partitioning + multi-tenancy

**`PARTITION BY toYYYYMM(timestamp)` — do now.** Partitioning is a data-management tool, not a query optimizer; keep partition-key cardinality **< 100–1000**. Monthly = ~12/year, aligns with TTL so whole partitions drop as fast metadata ops. Do NOT partition by `tenant_id` (cardinality = tenant count → blows the part limit and triggers "too many parts"); tenant isolation comes from `tenant_id` leading the ORDER BY, not from partitioning. Composite `(tenant_id, toYYYYMM)` is acceptable only under ~50 tenants; beyond that you exceed recommended part counts and merges degrade. Rule of thumb: keep active parts well under ~1,000/table. Sources: https://clickhouse.com/docs/en/optimize/partitioning-key , https://oneuptime.com/blog/post/2026-03-31-clickhouse-multi-tenant-schema/view

**Multi-tenancy: single shared table + `tenant_id` column + RBAC row policies.** ClickHouse's official recommendation is unambiguous — this "handles potentially millions of tenants"; table-per-tenant and database-per-tenant "don't scale for 1000s of tenants."

| Model | Isolation | Scale | Verdict |
|---|---|---|---|
| **Shared table + `tenant_id`** | Row-level (RBAC row policies), key pruning | Millions | **Recommended — do now** |
| Table-per-tenant | Physical | ~1000s max, metadata bloat | Only if schemas diverge |
| Database-per-tenant | Physical | Hard to manage at high count | Only if each tenant needs many tables/MVs |
| Compute-compute separation (Warehouses) | Shared object storage, isolated compute | Cloud only | For noisy-neighbor CPU isolation at scale |
| Separate services/clusters | Full | Heavy ops | Only for legal/region/data-residency |

At scale, if you hit CPU noisy-neighbor problems (a compute problem, not a data-model problem), reach for compute-compute separation / Warehouses (Cloud), not table splitting. Reserve dedicated tables only for divergent schemas or data-residency law. Apply the same `tenant_id`-first ordering to every MV target. Source: https://clickhouse.com/docs/cloud/bestpractices/multi-tenancy

### A6. TTL + tiered storage + per-tenant retention

Full grammar: `TTL expr [DELETE | RECOMPRESS codec | TO DISK 'x' | TO VOLUME 'y'][, …] [WHERE conditions] [GROUP BY key_expr [SET v = aggr(v), …]]`. Source: https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree

**Row expiry (do now):** `TTL timestamp + INTERVAL 90 DAY DELETE`, partitioned on the same time field with `ttl_only_drop_parts = 1` so expiry drops whole partitions instead of rewriting rows. Source: https://clickhouse.com/docs/observability/managing-data

**Per-tenant retention** — there is NO native per-tenant TTL. Workarounds in order of practicality:
1. Per-row computed expiry: a `retention_days UInt16` column derived from the tenant's plan, then `TTL timestamp + INTERVAL retention_days DAY DELETE` (TTL can reference columns).
2. Discrete plan tiers: multi-rule `TTL timestamp + INTERVAL 30 DAY DELETE WHERE plan='free', timestamp + INTERVAL 365 DAY DELETE WHERE plan='pro'`.
3. Partition/table-per-large-tenant only for the few tenants whose retention/legal needs truly differ, then `ALTER TABLE … MODIFY TTL` per table.
Source: https://clickhouse.com/docs/guides/developer/ttl

**Rollup-on-expiry:** `GROUP BY` TTL collapses raw rows to aggregates when they age out (keep summaries forever, drop detail) — but the GROUP BY key must be a **prefix of the PRIMARY KEY**; use deterministic aggregates (sum/count/min/max/avg). TTL runs during merges (~every 4h, `merge_with_ttl_timeout=14400`); force with `OPTIMIZE … FINAL`.

**Tiered storage (at scale):** self-managed uses disks→volumes→policy XML (hot NVMe + cold S3), `TTL … TO VOLUME 'cold'` by age, `move_factor` (default 0.2) auto-migrates when hot fills; `max_data_part_size_bytes` caps parts on the hot volume. Full storage/compute separation (all data in S3) uses ReplicatedMergeTree + an S3 storage policy with a local cache disk (v22.8+). Two critical warnings: **never set an S3/GCS bucket lifecycle policy** ("not supported and could lead to broken tables" — ClickHouse owns object lifecycle), and S3-backed parts still need local metadata, so the classic failure is **local metadata/cache-disk exhaustion** even with petabytes free in S3; keep hot/recent (dashboard) data on NVMe. On ClickHouse Cloud, `TO VOLUME`/`TO DISK` tiering is neither available nor needed (SharedMergeTree already separates storage/compute); you only set DELETE/GROUP BY TTL. Cost/ops: self-managed cheaper at high stable throughput but costs engineering time; Cloud pricing changed Jan 2025 and added egress fees, so factor lock-in before committing years of cold data. Sources: https://clickhouse.com/docs/guides/developer/ttl , https://clickhouse.com/docs/guides/separation-storage-compute , https://clickhouse.com/docs/observability/managing-data , https://github.com/kasimeka/clickhouse-compute-storage-separation-literature-review , https://pulse.support/kb/clickhouse-cloud-pricing-guide

### A7. Async vs batched inserts + "too many parts"

**Prefer client/pipeline-side batching** (you control the Kafka sink) — most efficient, gives you dedup + back-pressure; ClickHouse-recommended default. Numbers: **≥1,000 rows/insert minimum, 10k–100k optimal, ~1 insert/1–2s per table**, each carrying 10K–500K rows. Above ~**500k rows/s** add servers, not settings. Sources: https://clickhouse.com/blog/common-getting-started-issues-with-clickhouse , https://clickhouse.com/docs/knowledgebase/exception-too-many-parts

Use **async inserts** only when batching isn't feasible (thousands of agents each sending tiny payloads). `async_insert=1` buffers server-side and flushes on `async_insert_max_data_size` (100 MiB), `async_insert_busy_timeout_ms` (200ms self-managed / **1000ms Cloud**), or `async_insert_max_query_number` (450). Keep `wait_for_async_insert=1` (persistence guarantee; `=0` is fire-and-forget, risks data loss on crash before flush). Adaptive timeouts default-on since **v24.2** (`async_insert_use_adaptive_busy_timeout`, oscillating 50–200ms). `async_insert_deduplicate` is OFF by default and can't be used with dependent MVs. Source: https://clickhouse.com/docs/optimize/asynchronous-inserts

**"Too many parts"** (error 252): every insert makes ≥1 part/partition; when inserts outrun merges, ClickHouse delays then rejects. Thresholds rose at **v23.6**: `parts_to_delay_insert` 150→**1000**, `parts_to_throw_insert` 300→**3000** (per partition); `max_parts_in_total` = 100,000 (across all partitions). Two root causes: too-frequent small inserts (fix with batching/async), and high-cardinality partition keys like `date_time_ms` (fix by partitioning monthly, keep partition-key cardinality < 1,000). Don't just raise the limits — you hit filesystem/inode limits; fix the insert pattern and partition key first. Merges run on a background pool (`background_pool_size`, `background_merges_mutations_concurrency_ratio`, `max_bytes_to_merge_at_max_space_in_pool`). Source: https://clickhouse.com/docs/knowledgebase/exception-too-many-parts

### A8. Replication / HA / sharding + Cloud vs self-managed

**Do now (self-managed):** `ReplicatedMergeTree` with 2 replicas + a **3-node ClickHouse Keeper** quorum (Raft, drop-in ZooKeeper replacement, linearizable reads+writes; 3 tolerates 1 failure, 5 tolerates 2). Each replica stores its own full copy; optional `insert_quorum` returns only after N replicas have the insert. Run Keeper on dedicated/non-busy nodes with dedicated log disk; use hostnames (not IPs); enable `async_replication` on v23.9+. Keeper runs ClickHouse Cloud's own fleet, so it's production-proven. Sources: https://clickhouse.com/docs/guides/sre/keeper/clickhouse-keeper , https://clickhouse.com/blog/bonree-replaces-zookeeper-with-clickhouse-keeper-for-drastically-improved-performance-and-reduced-costs

**Sharding (at scale):** replication is HA/read-scaling of the *same* data; sharding splits data when one node can't hold the dataset or keep up (rough trigger: sustained >500k rows/s, or working set beyond one node's RAM/storage). Write to a `Distributed` table fanning out to shard-local `ReplicatedMergeTree` tables. Shard by the dedup key so ReplacingMergeTree/argMax converge correctly.

**Cloud vs self-managed:** Cloud's **SharedMergeTree** (proprietary, not self-hostable) puts all durable data in object storage with stateless compute and leaderless async replication via Keeper, allowing hundreds of replicas per table and near-instant scaling with no resharding — plus managed Keeper/merges/backups and scale-to-zero/warehouses for compute-compute separation. Cost premium + engine lock-in + Jan-2025 egress fees. Self-managed = full control, no per-service premium, run anywhere, but you own Keeper, topology, merge tuning, backups, upgrades, and part firefighting; multi-tenancy is shared tables + `tenant_id` in sort key + row policies with self-managed noisy-neighbor isolation. Recommendation: Cloud to validate the pipeline fast; self-managed once cost/regulatory pressure and ops muscle justify it. Sources: https://clickhouse.com/blog/clickhouse-cloud-boosts-performance-with-sharedmergetree-and-lightweight-updates , https://clickhouse.com/docs/guides/separation-storage-compute , https://clickhouse.com/blog/clickhouse-cloud-stateless-compute

### A9. Backups / PITR

Native `BACKUP TABLE|DATABASE … TO Disk(...)` or `TO S3(...)` (v22.11+), transactionally consistent for MergeTree, non-blocking, with incrementals via `SETTINGS base_backup=…` (only changed parts). `clickhouse-backup` (Altinity, open source) is the de-facto self-managed tool (`ALTER TABLE … FREEZE` hardlink snapshots, `--diff-from-remote` incremental, compression, S3/GCS/Azure). **Crucial:** ClickHouse has no continuous WAL/redo log, so there is **no true continuous PITR like Postgres** — recovery point = last backup. Practical PITR = frequent incrementals (e.g. hourly) + **replay from Redpanda's committed offset** to roll forward (this is why Redpanda retention must cover your worst-case restore window). Cloud: automatic daily/24h retention (configurable), exportable to your own bucket, restore-to-new-service (~1TB in 10–15min; <20TB within an hour; ~50TB in 2–3h). Sources: https://clickhouse.com/docs/operations/backup/overview , https://clickhouse.com/docs/cloud/manage/backups/overview , https://chistadata.com/clickhouse-backup-for-backup-and-restore/ , https://oneuptime.com/blog/post/2026-03-31-clickhouse-point-in-time-recovery/view

---

## PART B — REDPANDA / STREAM

### B1. Producer durability (do now — nearly free)
**`acks=all` + `enable.idempotence=true`, RF=3.** With `acks=all` Redpanda acks only after a Raft-majority has **fsync'd to disk** — the key distinction from stock Kafka, which acks without requiring fsync and can lose unflushed data on a broker crash. Idempotence dedups producer *retries* via producer-ID + per-partition sequence numbers and preserves ordering with up to **5 in-flight requests** (no need to drop to 1); it requires `acks=all`, `retries>0`, `max.in.flight ≤ 5` (the client enforces these). Nuance: `acks` is a *client* property — modern clients (librdkafka, Java ≥3.0) default `enable.idempotence=true` which forces `acks=all`, but old/non-idempotent clients historically defaulted `acks=1`; verify explicitly. Throughput lever for later: write caching (`flush.ms`/`flush.bytes`) relaxes per-write fsync. Sources: https://docs.redpanda.com/current/develop/produce-data/configure-producers/ , https://docs.redpanda.com/current/get-started/architecture/ , https://docs.confluent.io/kafka/design/delivery-semantics.html

### B2. Exactly-once / transactions — supported, but skip them here
Kafka transactions are GA in Redpanda since **22.3 (Nov 2022)** (`transactional.id` + `read_committed` consumers; EOS = transactions + idempotent producer). But (a) a transaction can't extend into the ClickHouse write, so EOS buys nothing on the sink side, and (b) real caveats: not atomic under Tiered-Storage remote recovery, producer-ID cardinality can OOM the broker (`max_concurrent_producer_ids`), compaction removes aborted-transaction data, and `read_committed` consumers can **stall behind a long-running open transaction** (Last Stable Offset semantics — a genuine streaming-sink latency risk). Implementation has historically lagged Kafka's reference in completeness — test your exact client/version. Sources: https://docs.redpanda.com/current/develop/transactions/ , https://www.redpanda.com/blog/whats-new-in-redpanda-22-3 , https://www.conduktor.io/glossary/exactly-once-semantics-in-kafka , https://www.conduktor.io/glossary/redpanda-vs-kafka

### B3. Near-exactly-once path — confirmed pattern
**At-least-once + idempotent producer + dedup in ClickHouse by `event_id`.** Confluent's own guidance offers exactly this branch: "implement downstream deduplication using unique message keys alongside at-least-once delivery." Mint `event_id` **once in the HTTP collector** so it survives redelivery unchanged; any consumer dedups on it regardless of partition/offset ("at-least-once delivery, exactly-once effect"). This sidesteps every transaction caveat above and the fact that transactions can't span into ClickHouse anyway. Only add Kafka transactions if you later insert a Kafka→Kafka processing stage needing atomic multi-partition/offset writes. Tradeoff: transient duplicate rows in ClickHouse between ingest and merge/dedup — acceptable because ClickHouse dedups by `event_id`. Sources: https://docs.confluent.io/kafka/design/delivery-semantics.html , https://www.trinitylogic.co.uk/blog/kafka-consumer-idempotency-exactly-once/ , https://medium.com/@omriamitay/idempotency-vs-atomicity-designing-reliable-kafka-consumers-ad57d82835dd

### B4. Retention + tiered storage
`cleanup.policy=delete` (NOT compact — compaction would collapse your event history, and is best-effort anyway), with `retention.ms` (time) and `retention.bytes` (**per partition**; total ≈ value × partition count; whichever limit hits first triggers cleanup). **Tiered Storage** offloads log segments to object storage (S3/GCS/Azure Blob) and needs both *remote write* (leader uploads segments) and *remote read* (fetch archived segments back), enabling near-infinite/infinite retention with small local disk; **Remote Read Replicas** are read-only topics served directly from Tiered Storage for fan-out. **Licensing flag:** Tiered Storage, infinite retention, and Remote Read Replicas are **Enterprise features** (30-day trial), not on the free tier; remote recovery breaks transaction atomicity. Do now: local `delete` retention sized to cover ClickHouse's worst-case restore window (your practical PITR backstop). At scale: Tiered Storage for cheap long history. Sources: https://docs.redpanda.com/current/reference/properties/topic-properties/ , https://docs.redpanda.com/current/manage/cluster-maintenance/compaction-settings/ , https://docs.redpanda.com/current/manage/tiered-storage/ , https://docs.redpanda.com/current/get-started/licensing/overview/ , https://www.redpanda.com/blog/remote-read-replicas-for-distributing-work

### B5. Consumer offsets for the ClickHouse sink
**Commit-after-write** for at-least-once (a crash between write and commit replays → duplicates, never loss). Two paths: (A) **custom/Vector consumer** with `enable.auto.commit=false`, committing offsets only after ClickHouse confirms the insert — gives tenant routing, back-pressure, batch control (10k–100k rows, ~1/s), consumer-group parallelism, and observability the Kafka engine lacks; (B) **ClickHouse Kafka table engine** — simplest (advances offsets as the MV materializes blocks), but explicitly at-least-once with a known two-commit duplicate window (block flushed, then offset committed; a drop or rebalance between them re-reads). Only **ClickHouse Kafka Connect** (offsets in Keeper) claims exactly-once, at the cost of running Kafka Connect. On Cloud, **ClickPipes** (managed, at-least-once) skips consumer ops. In all cases pair with `ReplacingMergeTree`+`event_id` dedup + query-time `FINAL`/`argMax`; don't rely on identical-block dedup alone (fragile under rebalance). **Recommendation: external batching consumer (Vector/custom) → `ReplicatedMergeTree`, commit-after-write.** Sources: https://clickhouse.com/docs/integrations/kafka/kafka-table-engine , https://www.glassflow.dev/blog/kafka-to-clickhouse , https://altinity.com/blog/kafka-engine-the-story-continues , https://oneuptime.com/blog/post/2026-03-31-clickhouse-handle-duplicate-events/view

---

## PART C — POSTGRES CONTROL PLANE

### C1. Backups / PITR
**Do now: managed Postgres (RDS/Aurora/Cloud SQL), lean on built-in PITR, set retention to max (35 days on RDS/Aurora), and actually test a restore into a scratch instance** — untested backups are the real risk. PITR always spins up a new instance, never in-place (RDS ships transaction logs to S3 every 5 min, restore to any time up to `LatestRestorableTime`; Aurora typically within ~5 min of now). Self-managed/at-scale: PITR = one base backup (`pg_basebackup -X stream -Ft`) + continuous WAL archiving (`wal_level=replica`, `archive_mode=on`, `archive_command`/`archive_library`), restore via `restore_command` + `recovery_target_time` + `recovery.signal` (PG12+ dropped `recovery.conf`). Use **pgBackRest to object storage** (full weekly + incremental/differential daily + continuous WAL archive, `archive_timeout ~60s` to bound RPO) — choose pgBackRest over WAL-G specifically for parallel restore (lower RTO); WAL-G is simpler/cloud-native when RTO is relaxed. PG17+ adds incremental base backups (`pg_basebackup --incremental` + `pg_combinebackup`). A streaming replica is HA, not a backup (it replicates your `DELETE`). Sources: https://www.postgresql.org/docs/current/continuous-archiving.html , https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html , https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-pitr.html , https://www.kunalganglani.com/blog/postgresql-backup-tools-compared

### C2. Connection pooling + the RLS session-state footgun
**PgBouncer transaction mode, and set tenant context ONLY transaction-scoped.** In transaction pooling, backends are recycled at COMMIT, so a bare `SET app.tenant = …` (= `SET SESSION`) **persists and leaks into the next tenant's transaction** on that connection. PgBouncer's own feature matrix marks SET/RESET (also LISTEN, session advisory locks, WITH HOLD cursors, PREPARE/DEALLOCATE) as "Never" supported in transaction mode, and `server_reset_query`/`DISCARD ALL` only runs in *session* mode — you cannot rely on it to scrub the leak. Safe pattern:
```sql
BEGIN;
SET LOCAL app.tenant = '…';                  -- vanishes at COMMIT/ROLLBACK
-- or, parameterizable:
SELECT set_config('app.tenant', $1, true);   -- 3rd arg true = transaction-local
SELECT … ;                                    -- RLS reads current_setting('app.tenant')
COMMIT;
```
Enforce this in a single DB-access wrapper so no code path can issue a bare `SET`. The classic Crunchy "set at connection setup" pattern is only safe with session pooling or a dedicated connection. Pooler alternatives at scale: PgCat (Rust, multithreaded, read/write split + sharding, ~2× qps of PgBouncer/Supavisor at >750 clients), Supavisor (Elixir, serverless/edge fan-out), RDS Proxy (managed, same RLS rule applies). Sources: https://www.pgbouncer.org/features.html , https://www.pgbouncer.org/config.html , https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres , https://legacy.tembo.io/blog/postgres-connection-poolers/

### C3. RLS performance at scale
**Wrap the setting in a scalar subquery — `(SELECT current_setting('app.tenant'))` — and index `tenant_id`.** RLS otherwise strips the planner's ability to inline `current_setting()` (a STABLE function), re-evaluating it per row; the subquery makes it an initPlan run once per statement. Supabase benchmarks **~11,000ms → ~10ms** from this wrapping alone. Policies should read `USING (tenant_id = (SELECT current_setting('app.tenant'))::uuid)`. Other levers (same Supabase source): index the tenant column (reported **>100×** on large tables; lead composite indexes with `tenant_id`); scope every policy `TO authenticated`/`TO <app_role>` (not PUBLIC) so it's skipped for inapplicable roles; avoid per-row joins in policies (hoist to `= ANY(ARRAY(SELECT …))`/`IN`, evaluated once); verify with `EXPLAIN ANALYZE` that the tenant predicate is an InitPlan driving an index scan, not a per-row filter. Sources: https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv , https://medium.com/@antstack/optimizing-rls-performance-with-supabase-postgres-fa4e2b6e196d

### C4. RLS correctness gotchas (do now)
- **Never run app connections as table owner or superuser** — owners/`BYPASSRLS`/superusers silently bypass RLS, so every policy becomes a no-op and you'll falsely "pass" isolation tests run as the owner. Use a dedicated non-owning, non-superuser, non-BYPASSRLS app role (migrations run as owner separately); add **`ALTER TABLE … FORCE ROW LEVEL SECURITY`** so even the owner is subject to policies.
- **`WITH CHECK` must pin `tenant_id`** on INSERT/UPDATE — `USING` alone (which filters visible rows) lets a tenant write someone else's `tenant_id`.
- **Fail closed on unset context:** `NULLIF(current_setting('app.tenant', true), '')::uuid` — the `true` missing_ok form avoids an error on unset GUC and matches nothing rather than everything.
- Multiple policies OR-combine (permissive) by default — adding a policy *widens* access; use `AS RESTRICTIVE` when a guard must always hold (AND).
- Context leak via pooler — transaction-scope the GUC (§C2); do not depend on `server_reset_query`/`DISCARD ALL`.
- Write an automated test that queries **as the app role** (never the owner) across two tenants and asserts zero cross-tenant rows on SELECT *and* INSERT/UPDATE.
- Sources: https://www.postgresql.org/docs/current/ddl-rowsecurity.html , https://www.bytebase.com/blog/postgres-row-level-security-footguns/ , https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres

**The two "if you do nothing else" Postgres items:** (1) never let the app connect as owner/superuser + `FORCE ROW LEVEL SECURITY`; (2) set tenant context only via `SET LOCAL`/`set_config(...,true)` inside a transaction so it can't leak across pooled connections.

---

## CONSOLIDATED PRIORITIES

**Do now (cheap, high-leverage)**
1. ClickHouse: shared table, `ORDER BY (tenant_id, task_type, event_type, timestamp)`, `PARTITION BY toYYYYMM(timestamp)`, RBAC row policies.
2. LowCardinality on enum-like columns; per-column codecs (DoubleDelta/Delta+ZSTD(1) for time, T64+ZSTD(1) for token/latency ints, ZSTD(1) for text); keep granularity 8192.
3. Idempotency: mint `event_id` in the collector; `ReplacingMergeTree(ver)` keyed on `…, event_id`; `insert_deduplication_token` per batch; `argMax` in grouped queries, FINAL only for selective lookups.
4. Ingest via an external batching consumer (Vector/custom) → ReplicatedMergeTree, 10k–100k rows/insert, ~1/s, commit-after-write; 3-node Keeper + 2 replicas.
5. Incremental MVs → AggregatingMergeTree targets (few wide targets at `(tenant_id, task_type, tool, bucket)`) for the 21 metrics; DELETE TTL aligned to partitions + `ttl_only_drop_parts=1`; per-row `retention_days` for per-tenant retention.
6. Redpanda: `acks=all` + `enable.idempotence=true`, RF=3, `cleanup.policy=delete`, retention ≥ CH restore window.
7. Postgres: managed PITR + tested restores; PgBouncer transaction mode with `SET LOCAL`/`set_config(...,true)` only; `(SELECT current_setting('app.tenant'))` + index `tenant_id`; non-owner role + FORCE RLS + WITH CHECK + fail-closed GUC + 2-tenant isolation test.

**Do at scale**
- ClickHouse: S3 tiered storage via `TO VOLUME` (watch local metadata-disk headroom; never set bucket lifecycle rules) or SharedMergeTree on Cloud; shard behind Distributed past ~500k rows/s; chained MVs for month/quarter rollups; `is_deleted` + `OPTIMIZE … FINAL CLEANUP`; clickhouse-backup incrementals.
- Redpanda: Tiered Storage (Enterprise) for infinite retention; scale consumer-group partitions; transactions only if a Kafka→Kafka stage needs them.
- Postgres: pgBackRest→S3; PgCat/Supavisor; de-joined RLS policies verified via EXPLAIN; CI enforcement that every tenant table has RLS enabled+FORCED, no prod BYPASSRLS.

**Version-sensitivity flags to verify against your builds:** ClickHouse FINAL is only "cheap" from ~23.3 (cross-partition auto-decision default only 26.2); `parts_to_throw_insert` 300→3000 and `parts_to_delay_insert` 150→1000 at 23.6; async adaptive timeouts default-on 24.2 (Cloud busy timeout 1000ms vs 200ms); native BACKUP needs 22.11+; Keeper `async_replication` since 23.9; projection-with-deletes `lightweight_mutation_projection_mode` v24.7+, multi-projection filtering v25.6+; self-managed S3 storage policies v22.8+; SharedMergeTree is Cloud-only/proprietary; Cloud egress fees since Jan 2025. Redpanda transactions GA 22.3 (with remote-recovery/producer-ID/read_committed-stall caveats); Tiered Storage + infinite retention + Remote Read Replicas are Enterprise-licensed; modern-client idempotence forces acks=all but old clients may default acks=1. Two data-dependent (not version) items to benchmark on your own data: Gorilla-vs-ZSTD on `latency_ms`, and FINAL-vs-argMax by query selectivity (>50% filtered → FINAL, ≤50% → argMax).

---

## SOURCE INDEX
- https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree
- https://clickhouse.com/docs/guides/developer/deduplication
- https://clickhouse.com/docs/guides/developer/deduplicating-inserts-on-retries
- https://kb.altinity.com/altinity-kb-schema-design/insert_deduplication/
- https://kb.altinity.com/altinity-kb-schema-design/row-level-deduplication/
- https://kb.altinity.com/altinity-kb-queries-and-syntax/altinity-kb-final-clause-speed/
- https://clickhouse.com/docs/changelogs/26.2
- https://github.com/ClickHouse/ClickHouse/issues/49685
- https://medium.com/insiderengineering/clickhouse-query-optimization-argmax-vs-final-50c710a1a7f3
- https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes
- https://clickhouse.com/resources/engineering/observability-cost-optimization-playbook
- https://clickhouse.com/resources/engineering/clickhouse-query-optimisation-definitive-guide
- https://clickhouse.com/docs/sql-reference/data-types/lowcardinality
- https://clickhouse.com/blog/10-best-practice-tips
- https://clickhouse.com/resources/engineering/database-compression
- https://clickhouse.com/blog/optimize-clickhouse-codecs-compression-schema
- https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy
- https://clickhouse.com/docs/materialized-view/incremental-materialized-view
- https://clickhouse.com/docs/managing-data/materialized-views-versus-projections
- https://clickhouse.com/docs/en/optimize/partitioning-key
- https://oneuptime.com/blog/post/2026-03-31-clickhouse-multi-tenant-schema/view
- https://clickhouse.com/docs/cloud/bestpractices/multi-tenancy
- https://clickhouse.com/docs/guides/developer/ttl
- https://clickhouse.com/docs/observability/managing-data
- https://clickhouse.com/docs/guides/separation-storage-compute
- https://github.com/kasimeka/clickhouse-compute-storage-separation-literature-review
- https://pulse.support/kb/clickhouse-cloud-pricing-guide
- https://clickhouse.com/docs/optimize/asynchronous-inserts
- https://clickhouse.com/docs/knowledgebase/exception-too-many-parts
- https://clickhouse.com/blog/common-getting-started-issues-with-clickhouse
- https://clickhouse.com/docs/guides/sre/keeper/clickhouse-keeper
- https://clickhouse.com/blog/bonree-replaces-zookeeper-with-clickhouse-keeper-for-drastically-improved-performance-and-reduced-costs
- https://clickhouse.com/blog/clickhouse-cloud-boosts-performance-with-sharedmergetree-and-lightweight-updates
- https://clickhouse.com/blog/clickhouse-cloud-stateless-compute
- https://clickhouse.com/docs/operations/backup/overview
- https://clickhouse.com/docs/cloud/manage/backups/overview
- https://chistadata.com/clickhouse-backup-for-backup-and-restore/
- https://oneuptime.com/blog/post/2026-03-31-clickhouse-point-in-time-recovery/view
- https://clickhouse.com/docs/integrations/kafka/kafka-table-engine
- https://altinity.com/blog/kafka-engine-the-story-continues
- https://www.glassflow.dev/blog/kafka-to-clickhouse
- https://oneuptime.com/blog/post/2026-03-31-clickhouse-handle-duplicate-events/view
- https://docs.redpanda.com/current/develop/produce-data/configure-producers/
- https://docs.redpanda.com/current/get-started/architecture/
- https://docs.redpanda.com/current/manage/high-availability/
- https://docs.redpanda.com/current/develop/transactions/
- https://www.redpanda.com/blog/whats-new-in-redpanda-22-3
- https://www.conduktor.io/glossary/exactly-once-semantics-in-kafka
- https://www.conduktor.io/glossary/redpanda-vs-kafka
- https://docs.confluent.io/kafka/design/delivery-semantics.html
- https://www.trinitylogic.co.uk/blog/kafka-consumer-idempotency-exactly-once/
- https://medium.com/@omriamitay/idempotency-vs-atomicity-designing-reliable-kafka-consumers-ad57d82835dd
- https://docs.redpanda.com/current/reference/properties/topic-properties/
- https://docs.redpanda.com/current/manage/cluster-maintenance/compaction-settings/
- https://docs.redpanda.com/current/manage/tiered-storage/
- https://docs.redpanda.com/current/get-started/licensing/overview/
- https://www.redpanda.com/blog/remote-read-replicas-for-distributing-work
- https://www.postgresql.org/docs/current/continuous-archiving.html
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-pitr.html
- https://www.kunalganglani.com/blog/postgresql-backup-tools-compared
- https://www.pgbouncer.org/features.html
- https://www.pgbouncer.org/config.html
- https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres
- https://legacy.tembo.io/blog/postgres-connection-poolers/
- https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- https://medium.com/@antstack/optimizing-rls-performance-with-supabase-postgres-fa4e2b6e196d
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://www.bytebase.com/blog/postgres-row-level-security-footguns/

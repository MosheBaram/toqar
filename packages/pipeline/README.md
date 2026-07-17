# @toqar/pipeline

Redpanda → ClickHouse delivery for the ingestion plane. One wide
`toqar.events` table (ReplacingMergeTree keyed on `tenant_id, event_id`);
redeliveries dedupe at merge time, exact reads use `FINAL`. Unmappable
messages are counted, never silently dropped.

## Local / dev stack

```bash
docker compose -f infra/docker-compose.yml up -d --wait
TOQAR_INTEGRATION=1 pnpm --filter @toqar/pipeline test   # real-pipe suite
docker compose -f infra/docker-compose.yml down -v
```

The same suite runs in CI (`.github/workflows/integration.yml`) on PRs
touching ingestion packages. Compose credentials are dev-only.

## Deploy runbook (design D1: one VM, compose, managed nothing)

Execution requires a provider account — operator steps:

1. Provision one VM (≥4GB RAM; Hetzner CX32-class or Fly equivalent).
   Install Docker + compose plugin.
2. Copy `infra/docker-compose.yml`; replace the dev ClickHouse
   credentials with real secrets (env file outside the repo).
3. Run the collector (`buildCollectorApp` + `createRedpandaSink` +
   `BufferedSink`) behind a TLS-terminating proxy (Caddy is the boring
   choice) on the collector DNS name. Postgres (registry service) supplies
   tenant auth — point both services at the same instance.
4. Backups off-box daily: `clickhouse-backup` or `BACKUP TABLE toqar.events`
   to object storage; test a restore once before first partner data.
5. Smoke: emit one event through `@toqar/sdk` at the public endpoint and
   confirm it is queryable (`SELECT ... FROM toqar.events FINAL`) within
   seconds.

Revisit criteria (design open question): >50 events/sec sustained or the
first paying non-partner tenant reopens the managed-vs-VM decision.

## Query guidance

Until the semantic layer (change 1.4) encodes it: always read with
`FINAL` (or aggregate over `event_id`) — the table is eventually-deduped,
not insert-time-unique.

## Data lifecycle & tiered storage (spec: analytics-storage)

- **Per-tenant retention**: every event row carries `retention_days`
  (resolved from the tenant's control-plane setting at collection time,
  default 365, bounds 1–3650); the events TTL is
  `timestamp + toIntervalDay(retention_days)` with `ttl_only_drop_parts`.
  Change it per tenant via `RegistryStore.setRetentionDays` (audited).
- **Citation log**: `toqar.executed_queries` keeps 400 days — past the
  maximum default event retention, so citations resolve for as long as the
  data they cite exists.
- **Right-to-be-forgotten**: `deleteTenantEvents(ch, tenantId)` removes a
  tenant's rows from `toqar.events` and `toqar.daily_rollups` (lightweight
  deletes — immediately invisible to queries, physically removed at merge).
  Verified by the integration suite.
- **Tiered storage (deployment, operator-gated)**: hot NVMe → object
  storage is a ClickHouse *storage policy* (disks/volumes config), not DDL.
  At deploy time: define an S3 disk + `hot`/`cold` volumes, then
  `ALTER TABLE toqar.events MODIFY TTL toDateTime(timestamp) + toIntervalDay(30) TO VOLUME 'cold', toDateTime(timestamp) + toIntervalDay(retention_days) DELETE`.
  Two hard rules from the persistence research: **never set an S3 bucket
  lifecycle policy** (ClickHouse owns object lifecycle), and watch local
  metadata-disk headroom — S3-backed parts still keep local metadata. On
  ClickHouse Cloud, tiering is built in (SharedMergeTree); only the DELETE
  TTL applies.

## Stream durability (spec: stream-pipeline)

- **Producer**: idempotent + `acks=-1` (all in-sync replicas; Redpanda acks
  after fsync) — a retry after an ambiguous failure cannot duplicate on the
  broker. Correctness no longer rests solely on ClickHouse dedup.
- **Sink**: offsets commit only **after** the durable ClickHouse write — a
  crash between write and commit re-processes (dedup absorbs the replay),
  never skips.
- **Dead letters**: unmappable/unparsable messages and batches that still
  fail insertion after a retry go to `toqar.events.dlq` with their reason —
  recoverable, never dropped. If the DLQ write fails, the batch is not
  committed and re-processes.
- **Backpressure**: the collector's buffer never acknowledges-then-drops —
  past capacity it answers 503 (`ingest_backpressure`) and the SDK retries.
- **Topics**: `ensureTopics()` provisions `cleanup.policy=delete` with
  explicit retention (events 7d — sized to cover the ClickHouse restore
  window, the practical PITR backstop; DLQ 30d). Tiered (object-storage)
  retention is a Redpanda Enterprise deployment setting; apply it at deploy
  time for long history.

## Replication, HA & backups (deployment runbook — spec: analytics-storage)

Production topology (operator-gated; the schema and migrations are
engine-compatible):

- **Replication**: `ReplicatedMergeTree` with 2 replicas + a dedicated
  3-node **ClickHouse Keeper** quorum (Raft; tolerates one failure). At
  deploy, the events/rollup tables are created with the Replicated engines
  (same columns/keys as the migrations here); `insert_deduplication_token`
  then gives block-level idempotency natively via the replicated window.
- **Backups**: native `BACKUP TABLE toqar.events TO S3(...)` with
  incrementals (`SETTINGS base_backup = ...`). ClickHouse has no continuous
  WAL — there is no Postgres-style PITR. Practical PITR = frequent
  incrementals + **replay from Redpanda's committed offsets**, which is why
  the events topic retention (7d, `ensureTopics`) must cover the worst-case
  restore window. Exercise a restore before taking real traffic.
- **Cloud option**: ClickHouse Cloud (SharedMergeTree) replaces all of the
  above with managed replication/backups; the DELETE TTLs and schema apply
  unchanged.

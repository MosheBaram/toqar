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

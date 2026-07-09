# Tasks — Ingestion Plane

> TDD on seams; compose-based integration job for the real pipe. Each group ships through the PR loop.

## 1. SDK (spec: sdk-node)

- [x] 1.1 Scaffold `packages/sdk` from the analytics-wrapper template lineage; typed emitters over `track()`
- [x] 1.2 TDD envelope completion, dev-mode schema validation, kill switch
- [x] 1.3 TDD batching/flush/drop-with-warning against a local http sink; bounded retries
- [x] 1.4 Commit, PR, merge

## 2. Collector (spec: event-collector)

- [x] 2.1 Scaffold `packages/collector` (Fastify, shared tenant auth against registry Postgres)
- [x] 2.2 TDD `POST /v1/events`: per-item validation, mixed-batch 202 semantics, snake_case product events
- [x] 2.3 TDD rejection counters per tenant + reason class; truthful `/health` incl. broker state
- [x] 2.4 TDD buffered publish over a `StreamSink` seam (in-memory in unit tests); broker-blip scenario
- [x] 2.5 Commit, PR, merge

## 3. Stream → ClickHouse (spec: stream-pipeline)

- [x] 3.1 docker-compose: Redpanda + ClickHouse + collector; ClickHouse `events` schema (D4) with event_id dedup
- [x] 3.2 Consumer/sink service: topic → ClickHouse inserts; idempotent redelivery
- [x] 3.3 `integration.yml` CI job: freshness (<10s) and duplicate-redelivery scenarios against compose
- [x] 3.4 Commit, PR, merge

## 4. OTLP intake (spec: otel-traces)

- [x] 4.1 OTLP/HTTP endpoint on the collector (tenant-authenticated)
- [x] 4.2 TDD versioned span→TOQAR mapping module (table-driven: GenAI llm span, tool span, root task span, unmappable counter)
- [x] 4.3 Integration scenario: vanilla OTel SDK export → step_executed rows in ClickHouse
- [x] 4.4 Commit, PR, merge

## 5. Deploy + close-out

- [ ] 5.1 Provision the VM (D1), compose up, backups off-box, collector DNS + TLS; smoke: SDK → queryable row
- [ ] 5.2 Runbook README (deploy, backup restore, buffer limits); root README update; `openspec validate --strict`; commit, PR, merge

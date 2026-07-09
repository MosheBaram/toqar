# Ingestion Plane

## Why

Today customer events land in *their* PostHog — Toqar analyzes borrowed data. Phase 1 change 1.3: our own boring, proven pipeline (SDK → collector → Redpanda → ClickHouse) so the analysis layer (1.4) has a substrate we control, with the OpenTelemetry trace endpoint from day one — cheap now, expensive to retrofit, and the differentiator for agent-native customers.

## What Changes

- New package `@toqar/sdk` (Node): the shipped analytics wrapper — typed per-event functions over one `track()`, fire-and-forget with batching, kill switch — pointed at our collector instead of PostHog.
- New package `@toqar/collector`: Fastify HTTP intake validating `toqarEventSchema` at the edge, tenant-token auth, buffered publish to Redpanda; rejects logged per tenant, never silently dropped.
- Stream pipeline: Redpanda topic → ClickHouse sink with `event_id` idempotency (near-exactly-once).
- **OTLP endpoint**: agent traces (tool calls, model, tokens, latency, task outcome) mapped into TOQAR events.
- The hosting decision the roadmap deferred lands here (design D1).

## Capabilities

### New Capabilities

- `sdk-node` — the customer-side emitter.
- `event-collector` — the authenticated, validating HTTP intake.
- `stream-pipeline` — Redpanda → ClickHouse delivery with idempotency.
- `otel-traces` — OTLP-compatible trace intake mapped to TOQAR events.

### Modified Capabilities

None.

## Impact

- Two new packages plus infrastructure (Redpanda, ClickHouse) — the repo's first deployed components; docker-compose for dev/e2e.
- Depends on 1.1 (tenant tokens). 1.4 depends on this change's ClickHouse tables.
- CI gains an integration job for the pipeline (compose-based), kept separate from the fast unit gate.

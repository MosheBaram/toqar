# Design — Ingestion Plane

## Context

First deployed infrastructure. Everything upstream (registry, agent) and downstream (analysis layer) is TypeScript; the pipeline stays boring and proven per the kickoff: Fastify collector, Redpanda, ClickHouse.

## Goals / Non-Goals

**Goals:** own the event substrate; OTLP from day one; spike tolerance; honest rejection accounting.
**Non-Goals:** browser SDK (partners are backend-agent-heavy; add when a partner needs it — new change); PostHog destination removal (the wrapper keeps working for concierge partners); exactly-once theology (near-exactly-once with idempotent reads is the bar).

## Decisions

### D1: Hosting — one VM, docker-compose, managed nothing *(recommendation, decide at review)*

Options: (a) **single VM (Hetzner/Fly) running compose: collector + Redpanda + ClickHouse** — cheapest, fully understood, adequate for design-partner volume by orders of magnitude; (b) managed ClickHouse Cloud + Redpanda Cloud — less ops, ~10× cost, two vendor onboardings; (c) Kubernetes — rejected outright at this scale. **Recommended: (a)**, with backups shipped off-box daily and the explicit note that G2 traffic growth reopens this decision. SOC 2 implications tracked in 1.6.

### D2: Collector reuses the registry-service seams

Same Fastify + zod-at-the-boundary pattern, same tenant-token auth resolved against the registry service's `tenants` table (shared Postgres). No new auth scheme.

### D3: Testing pyramid — unit on seams, compose for the pipe

ClickHouse and Redpanda have no PGlite equivalent. Unit tests run against in-memory `StreamSink`/`EventStore` seams (same philosophy as `SqlExecutor`); a separate CI job (`integration.yml`, compose-based) exercises collector → Redpanda → ClickHouse for the freshness and idempotency scenarios. The fast `verify` gate stays fast; the integration job is required on PRs touching these packages.

### D4: ClickHouse schema — one wide events table

`events` (tenant_id, event, event_id, timestamp, task_id, run_id, task_type, agent fields, JSON payload column for event-specific properties) with `ReplacingMergeTree` keyed for `event_id` dedup and `FINAL`-avoiding query guidance documented in the semantic layer (1.4). Materialized columns added when 1.4's queries prove the need — not before.

### D5: OTel mapping is versioned convention code

Span-attribute conventions (OpenTelemetry GenAI semconv where it exists, documented Toqar attributes where it doesn't) live in a versioned mapping module with table-driven tests. Mapping changes are registry-visible (they alter what events exist).

## Risks / Trade-offs

- [Single VM is a SPOF] → accepted for partner scale; buffering in SDK + collector rides restarts; G2 reopens.
- [OTel semconv for GenAI still moving] → mapping module versioned; unmapped-span counters make gaps visible instead of silent.
- [Compose job flakiness in CI] → integration job isolated from the required fast gate; flake-quarantine policy documented.

## Open Questions

- Managed vs self-hosted revisit criteria: >50 events/sec sustained or first paying non-partner tenant, whichever first.

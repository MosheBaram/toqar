# Design — Analysis Layer

## Context

The deterministic heart of the product. Consumers: weekly reports (immediately), the analysis agent + findings feed + MCP server (1.5), experiment guardrails (2.1). Seeds: `new-repo-handoff/quarry/` — anomaly-detection.ts, MetricsAggregator.ts, funnel/cohort engines, ab-testing stats (the last reserved for 2.1).

## Goals / Non-Goals

**Goals:** exhaustive headline-metric catalog; query identity on every number; primitives extracted test-first.
**Non-Goals:** dashboards or narrative (1.5's job); LLM anything — this package has zero Anthropic dependencies by construction; funnel/cohort engines beyond what TOQAR metrics need (R-layer retention uses cohort logic; the general engines stay quarry until a consumer exists).

## Decisions

### D1: Metric definitions as typed builders, not a DSL

Each metric is a TS function over a small query-AST (select/where/group helpers) → SQL string + params. A YAML/JSON metric DSL was rejected: ten-odd metrics don't justify an interpreter, and the type system already guards dimension/parameter validity. Revisit if customers ever define custom metrics.

### D2: Query identity = content hash

`query_id = q_<hash(sql + params)>` — stable for identical computations, automatically new when a definition changes. Executed results store `(query_id, sql, params, executed_at)` so citations resolve later (table lives with 1.3's ClickHouse or the control-plane Postgres; decided at implementation with 1.3's schema in hand).

### D3: Quarry extraction protocol

Per primitive: copy the pure math out of the quarry file → sever old-repo imports → write the spec's scenario tests first against the copied code → refactor to the package's shapes → record provenance in the module docblock. The quarry files themselves stay untouched (roadmap D5).

### D4: Execution seam

Primitives take plain arrays; the semantic layer takes a `QueryExecutor` seam (same philosophy as `SqlExecutor`) so unit tests run on fixture rows and integration tests (compose job from 1.3) run on real ClickHouse.

## Risks / Trade-offs

- [ClickHouse SQL dialect drift vs golden tests] → golden tests pin dialect; the 1.3 compose job executes them for real.
- [Overclaim Rate needs verification-event joins that partners may not emit] → metric defined now, result marked "insufficient data" honestly when inputs are absent (no fabricated denominator).

## Open Questions

- Where executed-query records live (ClickHouse table vs control-plane Postgres) — decide when 1.3's schema is real.

# @toqar/analysis

The deterministic heart: LLMs decide *what* to look at; this package
computes *the numbers*. Zero LLM dependencies by construction (zod is
the only runtime dep).

## Semantic layer

Every TOQAR headline metric (21 across the T/O/Q/A/R layers — the
catalog is pinned to `packages/registry/README.md` by test) compiles
from a typed definition to parameterized ClickHouse SQL:

```ts
const q = compileMetric('task_success_rate', {
  tenantId, from, to, segmentBy: 'task_type',
});
// q.id  → 'q_1a2b…' — stable content hash; the citation every surface shows
// q.sql → tenant-scoped, FINAL-reading, {param:Type}-parameterized SQL
```

The citation contract: every executed query is recorded
(`toqar.executed_queries`, written by `@toqar/pipeline`'s
`createMetricExecutor`) so any `q_…` id resolves to the exact SQL and
parameters that produced the number. Arithmetic is verified against real
ClickHouse in the integration job (fixture: 6 completed / 3 failed /
1 abandoned → TSR exactly 0.6).

Known proxies are stated in the definitions themselves (e.g.
`weekly_task_actors` uses `session_id` until account identity exists).

## Primitives

Pure functions over series (`number | null` — gaps stay gaps, never
interpolated): anomaly detection (z-score / modified-z (MAD) / IQR with
rolling baselines; formulas extracted from
`new-repo-handoff/quarry/anomaly-detection.ts`), changepoint location
(null for flat series), segment contribution ranking, and correlation
ranking (coefficients as leads, never causal claims; constant series
excluded rather than faked as zero).

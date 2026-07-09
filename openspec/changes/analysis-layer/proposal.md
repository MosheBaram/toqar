# Analysis Layer

## Why

Design principle 2 is absolute: LLMs decide *what* to look at; deterministic code computes *the numbers*. Before any analysis agent exists (1.5), the numbers it will cite must exist as tested, reproducible computations: every TOQAR headline metric as a generated ClickHouse query, and the statistical primitives (anomaly, changepoint, segmentation, correlation) as pure functions. Seeded from the quarry — the only salvage from the old repo, finally earning its keep.

## What Changes

- New package `@toqar/analysis`: two layers —
  - **Semantic layer**: every TOQAR headline metric (TSR, Overclaim Rate, First-Run Resolution, Abandonment, CPCT, Loop/Retry Ratio, per-tool failure, Human Edit Distance, Regression Delta, Autonomy Rate, Escalation, Override, Approval Friction, WTA, Task Depth, Delegation Share, Net Task Growth) compiled to parameterized ClickHouse SQL from the registry's vocabulary. Every result carries the exact query that produced it.
  - **Statistical primitives**: anomaly detection (z-score/MAD/IQR), changepoint detection, segmentation drill-down, correlation ranking — pure functions, TDD'd, extracted from `new-repo-handoff/quarry/` with old-repo imports severed.

## Capabilities

### New Capabilities

- `semantic-layer` — metric definitions → parameterized SQL with attached query identity.
- `analysis-primitives` — deterministic statistics over query results.

### Modified Capabilities

None.

## Impact

- New package; consumes the ClickHouse schema from 1.3 (queries target its `events` table) and `@toqar/registry` vocabulary.
- Depends on 1.3 for integration verification; primitives and SQL generation are testable before 1.3 ships (unit-level, golden SQL).
- This is the layer the weekly report, findings feed, and MCP server all read from — no consumer computes numbers any other way.

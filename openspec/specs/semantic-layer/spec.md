# semantic-layer Specification

## Purpose

Every TOQAR headline metric as a generated, parameterized ClickHouse
query with a content-hashed citation id — the deterministic number
source for every product surface.

## Requirements

### Requirement: Every headline metric is a generated, parameterized query

The semantic layer SHALL define every TOQAR headline metric from the public schema spec as a typed metric definition compiling to parameterized ClickHouse SQL (tenant, time window, segmentation dimension as parameters). Metric math lives in SQL and code — never in an LLM.

#### Scenario: TSR compiles

- **WHEN** `taskSuccessRate` is compiled for a tenant, week window, segmented by `task_type`
- **THEN** the output is executable SQL computing `task_completed / (task_completed + task_failed + task_abandoned)` per task_type with the tenant filter bound as a parameter

#### Scenario: Metric definitions are exhaustive

- **WHEN** the metric catalog is listed
- **THEN** every headline metric named in `packages/registry/README.md`'s five layers is present

### Requirement: Results carry their query identity

Every executed metric result SHALL carry the exact SQL, bound parameters, and a stable query id — the `↳ q_…` citation surface the product shows everywhere.

#### Scenario: Reproducibility

- **WHEN** a metric result is rendered anywhere (report, finding, MCP response)
- **THEN** its query id resolves to the exact SQL + parameters that produced the number

### Requirement: Golden SQL under test

Compiled SQL SHALL be covered by golden tests (definition → expected SQL) and by execution tests against seeded fixture data verifying the arithmetic (e.g., known event sets produce known TSR/CPCT values).

#### Scenario: Arithmetic verified

- **WHEN** the fixture dataset with 6 completed, 3 failed, 1 abandoned tasks is queried
- **THEN** TSR returns exactly 0.6

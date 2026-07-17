# semantic-layer Specification (delta)

## ADDED Requirements

### Requirement: Business-outcome join metrics

The semantic layer SHALL compute citation-backed metrics that join agent quality to product outcomes — the category whitespace no competitor owns: retention/activation cohorts cut by agent-quality signals (e.g. Weekly Task Actors retention for accounts above vs. below an override-rate threshold), task-depth expansion versus quality, and cost-per-completed-task as first-class unit economics comparable across task types and time. All such metrics follow the existing contract: parameterized SQL, tenant-scoped by construction, `q_<hash>` citation ids, deterministic — no LLM arithmetic.

#### Scenario: Quality cuts a retention cohort

- **WHEN** a retention metric is computed segmented by an agent-quality signal (e.g. high vs. low override rate accounts)
- **THEN** the result is produced by one parameterized, cited query over recorded events — reproducible from its `q_<hash>` like every other metric

#### Scenario: Unit economics are first-class

- **WHEN** cost-per-completed-task is requested per task type over a window
- **THEN** it computes from recorded step costs and task outcomes (failed runs included in the numerator), with a citation

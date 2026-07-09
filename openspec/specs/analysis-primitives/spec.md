# analysis-primitives Specification

## Purpose

Pure statistical functions (anomaly, changepoint, segmentation,
correlation) over metric series — deterministic verdicts with explicit
gaps and attached evidence.

## Requirements

### Requirement: Anomaly detection

Pure functions SHALL detect anomalies in metric series via z-score, modified z-score (MAD), and IQR methods with rolling baselines, returning per-point verdicts with the statistics that justified them.

#### Scenario: Known outlier flagged with its evidence

- **WHEN** a series with a planted 6-sigma point is analyzed
- **THEN** that point is flagged and the result includes the baseline mean/deviation used

### Requirement: Changepoint detection

A pure function SHALL locate level shifts in a metric series (e.g., TSR before/after a deploy), returning the change index and magnitude with a significance measure.

#### Scenario: Step change located

- **WHEN** a series steps from ~71 to ~62 at index k
- **THEN** the detected changepoint is k (±1) with a negative magnitude ≈ 9

### Requirement: Segmentation drill-down

Given a metric broken down by a dimension, a pure function SHALL rank segments by their contribution to an aggregate change, so "which task_type / tool drove the drop" is a computation.

#### Scenario: Dominant segment identified

- **WHEN** one tool's failure count explains 84% of a failure increase
- **THEN** that tool ranks first with its contribution share

### Requirement: Correlation ranking

A pure function SHALL rank candidate series by correlation with a target series over aligned windows, reporting coefficients — presented as leads for investigation, never as causal claims.

#### Scenario: Leading candidate surfaced

- **WHEN** tool-latency series and TSR series move together strongly
- **THEN** that pair ranks above unrelated candidates with its coefficient

### Requirement: Purity and provenance

Primitives SHALL be side-effect-free (data in, verdicts out), never fabricate values for missing data (gaps are explicit), and record which quarry file seeded them where applicable.

#### Scenario: Gaps stay gaps

- **WHEN** a series has missing windows
- **THEN** results mark those windows as absent rather than interpolating silently

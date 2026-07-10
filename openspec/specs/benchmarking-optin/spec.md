# benchmarking-optin Specification

## Purpose

Opt-in, k-anonymized cross-tenant metric benchmarks — no raw value ever
re-identifiable.

## Requirements

### Requirement: Opt-in only

Cross-tenant benchmarking SHALL be strictly opt-in per tenant. A tenant that has not explicitly opted in SHALL NOT contribute to any cohort aggregate and SHALL NOT see cohort comparisons. Opt-in and opt-out SHALL be recorded and audited.

#### Scenario: Non-opted-in tenant excluded

- **WHEN** a tenant has not opted in
- **THEN** its metrics are absent from every cohort aggregate and it receives no benchmark data

#### Scenario: Opt-out takes effect

- **WHEN** a previously opted-in tenant opts out
- **THEN** it stops contributing to future aggregates and the change is audited

### Requirement: k-anonymized aggregates only

Cohort benchmarks SHALL be computed only over aggregates that include at least k contributing tenants (k configurable, ≥ 5). No single tenant's raw metric value SHALL be derivable from a published benchmark; cohorts below k SHALL return "insufficient cohort" rather than a figure.

#### Scenario: Small cohort suppressed

- **WHEN** a benchmark cohort has fewer than k opted-in tenants
- **THEN** the benchmark is suppressed with an "insufficient cohort" result, not a computed number

#### Scenario: No re-identification

- **WHEN** a tenant views a benchmark it contributes to
- **THEN** it sees the cohort distribution and its own position, never another tenant's identity or raw value

### Requirement: Benchmarks are computed, not fabricated

Cohort figures SHALL be computed deterministically from opted-in tenants' semantic-layer metric results — never estimated, modeled, or LLM-generated.

#### Scenario: Benchmark reconciles

- **WHEN** a cohort median TSR is published
- **THEN** it equals the median of the opted-in tenants' computed TSR values for that window

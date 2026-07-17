# alerting Specification

## ADDED Requirements

### Requirement: Configurable alerts on metrics and eval signals

Tenants SHALL be able to configure alerts on TOQAR metrics (thresholds, and the existing anomaly/changepoint primitives) and on eval-signal regressions (score distribution shifts), with per-alert routing to Slack or webhook. Alert conditions evaluate against real computed values; an alert notification carries the triggering value with its citation (or, for judge signals, its labeled evaluator identity).

#### Scenario: A threshold alert fires with its evidence

- **WHEN** a tenant sets "alert when override rate exceeds 20% over 24h" and the computed value crosses it
- **THEN** a notification is delivered to the configured route carrying the actual value and its query citation

#### Scenario: An anomaly alert uses the deterministic primitives

- **WHEN** anomaly detection flags a task-success-rate excursion
- **THEN** the alert reflects the primitive's real output (no LLM-invented severity or value)

### Requirement: Alert lifecycle is recorded and honest

Every alert evaluation and delivery SHALL be recorded (fired/not-fired, delivered/failed) per tenant. Failures to deliver are visible, never silently swallowed; a quiet period with no data does not fabricate an "all clear".

#### Scenario: Delivery failure is visible

- **WHEN** a webhook delivery fails
- **THEN** the failure is recorded and observable to the tenant, and retried per policy

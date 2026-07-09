# registry-backend Specification (delta)

## ADDED Requirements

### Requirement: Experiment and verdict records

The service SHALL store, per tenant, experiment records (hypothesis, originating finding, target metric, guardrails, flag provider, variant PR reference, status) and their verdicts (decision, effect estimate, confidence sequence, per-arm samples, guardrail outcomes). Both SHALL be tenant-isolated and audited like every other mutation, and SHALL be readable newest-first.

#### Scenario: Experiment lifecycle recorded

- **WHEN** an experiment is created, moves to running, and concludes with a verdict
- **THEN** each transition appends an audit record and the final record carries the verdict with its statistics

#### Scenario: Tenant isolation extends to experiments

- **WHEN** tenant A's token requests tenant B's experiments or verdicts
- **THEN** the API responds 404/403 and no tenant-B data is returned

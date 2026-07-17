# autonomous-rollout Specification

## Purpose

Autonomy level 3 — the guardrailed closed loop: tenant-declared change classes and blast-radius limits, canary, sequential verdicts, auto-promote/auto-rollback, and a kill switch; everything audited.

## Requirements

### Requirement: Autonomy level 3 is an explicit, audited grant

The autonomy dial SHALL gain level 3 — "guardrailed autonomous rollout" — granted per tenant like every other level (explicit, audited, revocable). Below level 3, behavior is exactly today's: variant PRs and experiment verdicts require human action. Nothing about levels 0–2 changes.

#### Scenario: Level 3 requires an explicit grant

- **WHEN** a tenant at autonomy level 2 has a winning experiment
- **THEN** no automatic promotion occurs; promotion requires either a human or an audited grant to level 3 first

### Requirement: Declared change classes and blast-radius limits

Autonomous action at level 3 SHALL be constrained to tenant-declared change classes (e.g. flag/config rollouts, prompt-variant promotion) with declared blast-radius limits (maximum traffic share, protected task types, maximum concurrent autonomous changes). Anything outside the declared classes/limits falls back to the human-gated path.

#### Scenario: Out-of-class change falls back to a human

- **WHEN** the experiment agent proposes a change outside the tenant's declared classes
- **THEN** it takes the existing PR/human-review path, and the fallback is audited

### Requirement: Canary, sequential verdict, auto-promote, auto-rollback

A level-3 rollout SHALL proceed as: canary exposure within blast-radius limits → continuous monitoring with the always-valid sequential stats and the default guardrails (TSR, CPCT, Override Rate) → auto-promote only on a statistically valid win with no guardrail breach → immediate auto-rollback on a guardrail breach or invalidated verdict. Every transition SHALL be audited with its citation-backed evidence, and the verdict written to the registry like any experiment.

#### Scenario: A guardrail breach rolls back without a human

- **WHEN** a canaried variant breaches a guardrail metric during monitoring
- **THEN** the rollout auto-rolls-back immediately, the breach and rollback are audited with cited values, and the finding is delivered

#### Scenario: A win promotes with evidence

- **WHEN** the sequential test concludes a valid win within blast-radius limits and no guardrail breach
- **THEN** the variant promotes automatically, and the audit trail carries the verdict's statistics and query citations

#### Scenario: Kill switch

- **WHEN** the tenant revokes level 3 mid-rollout
- **THEN** in-flight autonomous rollouts halt safely (roll back or freeze per declared policy) and the revocation is audited

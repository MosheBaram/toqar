# sequential-stats Specification

## Purpose

Always-valid sequential testing over metric streams: continuous
monitoring without alpha inflation, effect estimates with confidence
sequences.

## Requirements

### Requirement: Always-valid sequential testing

The package SHALL provide sequential tests (e.g. mixture SPRT / always-valid confidence sequences) that permit continuous monitoring: the false-positive rate SHALL remain bounded by the configured alpha regardless of how many times results are inspected. Fixed-horizon tests SHALL NOT be used for agent-monitored experiments.

#### Scenario: Peeking does not inflate false positives

- **WHEN** an A/A stream (no true effect) is evaluated after every observation over a long run
- **THEN** the cumulative false-significant rate stays at or below the configured alpha

#### Scenario: True effect is detected and holds

- **WHEN** a variant with a real positive effect accrues data
- **THEN** the sequence crosses the significance boundary and the confidence sequence excludes zero and does not later un-conclude

### Requirement: Effect estimates with confidence sequences

Each evaluation SHALL return the point effect estimate, an always-valid confidence interval, the current decision (`inconclusive` | `ship` | `revert`), and the sample sizes per arm.

#### Scenario: Interval narrows with data

- **WHEN** more observations accrue for the same true effect
- **THEN** the confidence sequence width is non-increasing in expectation and the estimate converges toward the true effect

### Requirement: Purity and quarry provenance

The functions SHALL be side-effect-free (data in, decision out) and SHALL record in their module docblock which parts derive from `quarry/ab-testing-framework.ts` (the classical baseline extended, not copied wholesale).

#### Scenario: Deterministic

- **WHEN** the same observation stream is evaluated twice
- **THEN** the decisions and estimates are identical

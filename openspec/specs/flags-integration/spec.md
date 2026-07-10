# flags-integration Specification

## Purpose

A provider seam over existing flag systems (PostHog, LaunchDarkly) for
variant assignment, with exposure joined to TOQAR events for per-arm
metrics.

## Requirements

### Requirement: Provider seam over existing flag systems

Variant assignment SHALL go through a `FlagProvider` seam with adapters for PostHog and LaunchDarkly. Toqar SHALL NOT build its own flag store; a customer already running one of these providers gets experiments without a new dependency.

#### Scenario: Assign via the customer's provider

- **WHEN** an experiment starts for a tenant configured with PostHog
- **THEN** variant assignment and exposure reads go through the PostHog adapter, and no Toqar-owned flag state is created

#### Scenario: Unsupported provider refused honestly

- **WHEN** a tenant has no supported flag provider configured
- **THEN** the experiment cannot start and the agent reports the missing prerequisite — it does not silently invent assignments

### Requirement: Exposure joins to TOQAR events

The integration SHALL record which variant each `task`/`run` was exposed to, so guardrail metrics (from the semantic layer) can be computed per arm using existing `toqar.events` data with no new event types.

#### Scenario: Per-arm metrics computable

- **WHEN** an experiment has accrued exposures and outcomes
- **THEN** TSR, CPCT, and Override Rate can be computed per variant from the events table joined on exposure

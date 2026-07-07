# instrumentation-skill Specification

## Purpose

TBD - created by syncing change phase-0-validation-toolkit. Update Purpose after review.

## Requirements

### Requirement: Two-phase flow with a human review gate

The `instrument-agentic-app` skill SHALL operate in two phases: (1) read-only mapping of the partner repo's agent loop, producing a tracking plan as JSON matching `trackingPlanSchema` rendered via `renderTrackingPlan`; (2) implementation of the approved plan as a PR. The skill SHALL stop at the review gate after phase 1 and write no code before the plan is approved.

#### Scenario: Dry run stops at the review gate

- **WHEN** the skill is invoked against a repo and the plan has not been approved
- **THEN** a tracking plan is produced and no source files are modified

### Requirement: Instrumentation PR quality bar

The generated PR SHALL be mergeable with at most minor edits: every insertion is additive and side-effect-free for the host's control flow; all event delivery is fire-and-forget through a single typed wrapper (`src/analytics.ts`, one function per event, single `track()` chokepoint); the host repo's own typecheck and test commands pass; the PR body lists the tracking plan, verification results, and a rollback path.

#### Scenario: Analytics cannot block the agent loop

- **WHEN** the analytics destination is down or misconfigured
- **THEN** the host application's control flow is unaffected (fire-and-forget, no thrown errors reach the loop)

#### Scenario: Host verification passes

- **WHEN** the instrumentation PR is complete
- **THEN** the host repo's typecheck and test commands pass, and their invocations are recorded in the PR body

### Requirement: Privacy rules for generated code

Generated instrumentation SHALL transmit only IDs, enums, counts, latencies, and costs — never raw prompts, model outputs, or user content. Sensitive payloads SHALL be referenced via `*_ref` pointers into the partner's own storage. Instrumentation SHALL be disableable via an environment variable that swaps in a no-op destination.

#### Scenario: Kill switch

- **WHEN** the analytics-disable environment variable is set to `1`
- **THEN** the destination is a no-op and no events leave the process

#### Scenario: No content exfiltration

- **WHEN** any generated call site is reviewed
- **THEN** no argument carries raw user content, prompts, or model outputs

### Requirement: Fixture dry-run before partner use

The repo SHALL contain a small fixture agentic app (an agent loop with at least one model call, one tool call, and one human-approval seam, plus content that must NOT be captured). The skill SHALL be dry-run against the fixture, producing a tracking plan that validates against `trackingPlanSchema`, before it is ever run against a design partner's repo.

#### Scenario: Fixture dry-run produces a valid plan

- **WHEN** the skill is invoked against the fixture app
- **THEN** it produces a tracking plan that parses with `trackingPlanSchema`, anchors real `file:line` seams in the fixture, and stops without writing code

#### Scenario: Fixture bait not captured

- **WHEN** the fixture's tracking plan proposes event properties
- **THEN** none of them capture the fixture's planted sensitive content (it may only appear behind `*_ref` pointers)

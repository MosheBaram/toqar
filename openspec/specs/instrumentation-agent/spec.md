# instrumentation-agent Specification

## Purpose

The productized concierge: maps a customer repo, proposes a tracking
plan behind a mandatory review gate, implements approved plans with
host verification, and records every delivery so merge rate is a
computed metric. Seam maps compound per tenant in the registry backend.

## Requirements

### Requirement: Four-phase flow with a mandatory review gate

The agent SHALL execute the skill's proven phases: (1) read-only seam mapping, (2) tracking plan proposed as a registry diff and submitted to the registry backend as `proposed` entries, (3) implementation only after explicit human approval, (4) PR delivery. No code SHALL be written to the customer repo before approval.

#### Scenario: Review gate holds

- **WHEN** the agent runs without an approval for its proposed plan
- **THEN** the customer repo has no new commits and the tracking plan exists as `proposed` registry entries and a rendered markdown document

### Requirement: PR quality bar is measured

The generated PR SHALL meet the skill's bar — additive, fire-and-forget wrapper, host typecheck/tests pass, privacy rules identical to the skill (`*_ref` pointers, kill switch, no raw content). Every delivered PR SHALL be recorded (repo, date, outcome merged/rejected/edited) so merge rate is a computed product metric, not an anecdote.

#### Scenario: Outcome recorded

- **WHEN** a PR is delivered and later merged
- **THEN** the run record shows the delivery and the merge outcome, and merge rate derives from these records

### Requirement: Seam map persists per tenant

Each run SHALL persist its seam map — detected framework, task starts, LLM/tool call sites, outcome and handoff seams, task taxonomy — to the registry backend, and subsequent runs on the same repo SHALL load and reconcile it rather than remapping from scratch.

#### Scenario: Second run reuses context

- **WHEN** the agent runs twice against the same repo
- **THEN** the second run starts from the stored seam map and reports which seams changed

### Requirement: Scope honesty

The agent SHALL support TypeScript repos with React frontends and the one supported Node backend framework. On an unsupported stack it SHALL say so and stop — never guess its way through an unfamiliar framework.

#### Scenario: Unsupported stack refused

- **WHEN** the target repo is a Python service
- **THEN** the agent reports the unsupported stack and exits without producing a plan

### Requirement: Run cost surfaced

Every run SHALL report its Anthropic token usage and computed cost alongside its outputs.

#### Scenario: Cost visible

- **WHEN** a run completes
- **THEN** its summary includes tokens in/out and cost in USD

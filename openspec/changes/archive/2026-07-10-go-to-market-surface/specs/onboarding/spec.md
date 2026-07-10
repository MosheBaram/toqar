# onboarding Specification

## ADDED Requirements

### Requirement: Self-serve connect → plan → approve → flowing

A new tenant SHALL complete onboarding without Toqar staff: connect a repository, receive an instrumentation-agent-proposed tracking plan, approve it, and see data-flowing confirmation. The review gate is preserved — the plan is approved by the customer before any PR.

#### Scenario: Cold signup reaches first finding unassisted

- **WHEN** a new tenant connects a supported repo, approves the proposed plan, and merges the instrumentation PR
- **THEN** events flow to the collector and the first sweep produces a finding, with no Toqar human in the loop

#### Scenario: Unsupported repo is refused at connect

- **WHEN** the connected repo is an unsupported stack
- **THEN** onboarding stops with the agent's honest reason, before any plan is proposed

### Requirement: Time-to-first-finding is measured

Onboarding SHALL record the timeline (connected_at, plan_proposed_at, plan_approved_at, first_event_at, first_finding_at) per tenant so time-to-first-finding is a product metric, not an anecdote.

#### Scenario: Timeline recorded

- **WHEN** a tenant reaches its first finding
- **THEN** all onboarding timestamps exist and time-to-first-finding is computable

### Requirement: No fabricated progress

Onboarding status SHALL reflect real system state (real repo connection, real agent run, real events) — never a scripted or simulated "success" step.

#### Scenario: Honest pending state

- **WHEN** events have not yet arrived
- **THEN** onboarding shows the real pending step, not a fake completion

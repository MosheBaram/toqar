# billing Specification (delta)

## ADDED Requirements

### Requirement: Agent-native pricing option

Billing SHALL support a per-completed-task (or per-agent-run) pricing dimension alongside the existing tiers — agentic workloads emit orders of magnitude more raw events per unit of work, so per-event pricing punishes exactly the customers Toqar serves. Task/run counts used for billing SHALL reconcile to the recorded task events (the same meters-reconcile-to-source discipline as existing usage meters), and the priced unit is a completed task as recorded, never an estimate.

#### Scenario: A task-priced invoice reconciles to events

- **WHEN** a billing period closes for a tenant on task-based pricing
- **THEN** the billed task count equals the recorded completed-task count for that tenant and period, reproducible by query

# analysis-agent Specification

## Purpose

The narrating investigator: playbook-driven sweeps over the semantic
layer, publishing findings whose every number carries its query id.
The validation question log is its eval.

## Requirements

### Requirement: Playbook-driven investigations

The agent SHALL run standard playbooks per TOQAR layer (e.g., "TSR dropped → segment by task_type → correlate with per-tool failure → check recent agent.version/model changes"), where each step calls a semantic-layer query or analysis primitive as a tool. The agent chooses and orders steps; it never computes numbers itself.

#### Scenario: Regression playbook

- **WHEN** a sweep detects a TSR changepoint coinciding with an agent.version change
- **THEN** the produced finding's investigation chain shows the changepoint query, the segmentation drill-down, and the version comparison — each step with its query id

### Requirement: Findings cite everything

Every finding SHALL consist of a headline, a narrative summary, and an evidence chain in which every number resolves to a query id from the semantic layer. A finding containing an uncited number SHALL fail validation and not publish.

#### Scenario: Uncited number blocked

- **WHEN** a draft finding contains a numeric claim with no query id
- **THEN** it is rejected before publication and logged for prompt regression review

### Requirement: Sweeps are scheduled and honest

The agent SHALL run on a per-tenant schedule, and when a sweep finds nothing defensible it SHALL record "no findings" rather than manufacturing one. Fresh tenants see the honest empty state (D2's design) with real sweep timing.

#### Scenario: Nothing to say

- **WHEN** a sweep completes with no anomaly, changepoint, or threshold crossing
- **THEN** no finding publishes and the sweep record shows what was checked

### Requirement: The question log is the eval

The agent SHALL pass an eval harness built from the agent-shaped questions in `docs/validation/question-log.md` (as they accumulate): given the question and fixture data, the agent's answer must cite correct queries and correct numbers. The eval SHALL run in CI for the agent package.

#### Scenario: Eval gates the agent

- **WHEN** a prompt or playbook change makes a logged question's answer wrong
- **THEN** the agent package's CI fails

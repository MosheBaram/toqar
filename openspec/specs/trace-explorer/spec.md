# trace-explorer Specification

## Purpose

The agent-native run schema (sessions/turns/steps/agents, headless first-class) and the run drill-down answering "why did this run fail?" — one schema shared with the metrics.

## Requirements

### Requirement: Agent-native run schema, including headless runs

The platform SHALL model agent execution first-class over the existing events and OTLP traces: named agents (with sub-agent delegation), sessions/turns where a human is in the conversation, and runs composed of ordered spans (LLM calls, tool calls, retrievals, handoffs) reconstructable by task/run id. The schema SHALL treat **headless runs** (cron/background/API-initiated, no human turn, possibly multi-agent) as first-class rather than assuming chat-shaped sessions.

#### Scenario: A headless run is fully representable

- **WHEN** a background agent run with sub-agent delegation and no human turn is ingested
- **THEN** it is queryable as a complete run — agent, sub-agents, steps, outcome — without a fabricated "session" or "turn"

#### Scenario: Metrics compute over the agent schema

- **WHEN** a metric like per-tool failure rate or per-agent override rate runs
- **THEN** it computes over the same first-class entities the explorer shows (one schema, not a parallel model)

### Requirement: Run drill-down view

The product SHALL answer "why did this run fail?" with a per-run drill-down: a time-ordered waterfall of steps with durations, tool/model identity, token/cost figures, error and retry highlighting, and the human events (handoff, approval, edit, override) in place. Every number shown carries its source (recorded fields or a cited query).

#### Scenario: A failing run is debuggable in one view

- **WHEN** a user opens a failed run
- **THEN** they see the ordered steps with the failing tool call highlighted, its error, latency and token/cost context, and any human intervention — with no fabricated fields

#### Scenario: Findings link into runs

- **WHEN** a finding cites evidence involving specific runs
- **THEN** the finding links to those runs' drill-down views

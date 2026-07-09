# slack-delivery Specification

## Purpose

Findings and the weekly TOQAR digest delivered to Slack as Block Kit,
fire-and-forget with recorded outcomes.

## Requirements

### Requirement: Findings deliver as Block Kit messages

Published findings SHALL deliver to the tenant's configured Slack channel following the D2 `SlackFinding` translation: headline, summary with inline-code identifiers, fields row, ≤2 action buttons (deep link to the finding), mono context footer with query id.

#### Scenario: Finding arrives in Slack

- **WHEN** a finding publishes for a tenant with Slack configured
- **THEN** the channel receives the Block Kit message and its button opens that finding in the feed

### Requirement: Weekly digest automates the validation report

A weekly digest per tenant SHALL render the TOQAR snapshot (five layers, deltas), finding of the week, and a question-you-can-now-answer — the same structure as `docs/validation/weekly-report-template.md`, with every number citing its query.

#### Scenario: Digest numbers reproducible

- **WHEN** a digest is delivered
- **THEN** each metric in it resolves to a semantic-layer query id

### Requirement: Delivery is fire-and-forget with a record

Slack outages SHALL NOT block finding publication; delivery attempts and outcomes are recorded per finding for operator visibility.

#### Scenario: Slack down

- **WHEN** Slack returns errors for a delivery
- **THEN** the finding still publishes to the feed and the failed delivery is recorded with its reason

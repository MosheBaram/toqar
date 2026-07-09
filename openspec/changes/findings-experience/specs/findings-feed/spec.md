# findings-feed Specification

## ADDED Requirements

### Requirement: The app is a feed, built from the design system

The web app SHALL present findings as a stream of D2 `FindingCard`s (anomaly / regression / experiment / digest variants) with TOQAR-layer, severity, and task_type filters; "show the work" SHALL expand the D2 `EvidenceDrilldown` inline with copyable queries. No dashboard grid.

#### Scenario: Show the work

- **WHEN** a user expands a finding
- **THEN** the investigation chain renders with each step's query (copyable) and result, matching the evidence stored with the finding

### Requirement: Canonical event names

Product surfaces SHALL render TOQAR core events by their canonical names (`human_overrode`, `task_abandoned`, `step_executed`) — the D2 sample-copy aliases are display examples only (recorded in `skills/toqar-design/SYNC.md`).

#### Scenario: Core event rendered canonically

- **WHEN** a finding involves a human takeover
- **THEN** the UI shows `human_overrode`, not an alias

### Requirement: Registry browser

The app SHALL present the tenant's registry per the D2 registry screen: per-event identity card (description, journey, owner_metric, hypothesis, status, since_version) sourced from the registry backend.

#### Scenario: Deprecated history visible

- **WHEN** an event was deprecated by a tracking-plan application
- **THEN** it appears struck-through with status `deprecated`, never vanished

### Requirement: Honest empty and loading states

A fresh tenant SHALL see the D2 empty state with *real* status (data landed, registry synced, next sweep time) — no placeholder numbers anywhere in the app.

#### Scenario: Fresh tenant

- **WHEN** a tenant has data flowing but no completed sweep
- **THEN** the feed shows the sweep countdown sourced from the actual schedule

### Requirement: Autonomy dial is an auditable control

The settings surface SHALL present the D2 `AutonomyDial`; changing level requires confirmation, takes effect in the backend, and appends to the audit trail with actor and timestamp.

#### Scenario: Grant recorded

- **WHEN** an operator raises autonomy from 0 to 1
- **THEN** the backend records the grant (who, when) and the dial shows the audit line

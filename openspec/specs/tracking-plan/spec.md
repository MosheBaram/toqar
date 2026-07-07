# tracking-plan Specification

## Purpose

TBD - created by syncing change phase-0-validation-toolkit. Update Purpose after review.

## Requirements

### Requirement: Registry entry is an event's identity card

`registryEntrySchema` SHALL require, for every event: `event`, `description`, `journey` (the user/agent journey it belongs to), `owner_metric` (the metric it exists to serve), `status` (`proposed` | `active` | `deprecated`), and `since_version`. `hypothesis` (the question or bet behind the metric) MAY be present. No event exists without a named reason.

#### Scenario: Entry without owner metric rejected

- **WHEN** a registry entry omits `owner_metric`
- **THEN** `registryEntrySchema.safeParse` fails

#### Scenario: Complete entry accepted

- **WHEN** an entry carries event, description, journey, owner_metric, status, and since_version
- **THEN** `registryEntrySchema.safeParse` succeeds

### Requirement: Planned events carry implementation anchors

`plannedEventSchema` SHALL extend the registry entry with `code_locations` (at least one `path/to/file.ts:line` anchor per emission site) and `implementation_notes`.

#### Scenario: Planned event without code locations rejected

- **WHEN** a planned event omits `code_locations`
- **THEN** `trackingPlanSchema.safeParse` fails for the containing plan

### Requirement: Tracking plan is a diff against the registry

`trackingPlanSchema` SHALL define the reviewable artifact the instrumentation agent proposes before writing code: `repo`, `generated_at` (ISO 8601 with offset), `summary`, and `added` / `modified` / `removed` arrays of planned events.

#### Scenario: Valid plan accepted

- **WHEN** a plan carries repo, generated_at, summary, and well-formed added/modified/removed arrays
- **THEN** `trackingPlanSchema.safeParse` succeeds

### Requirement: Markdown rendering for human review

`renderTrackingPlan(plan)` SHALL return markdown containing a title with the repo name, the summary, and one row per planned event including its event name, owner metric, and code locations. Empty sections (e.g. no modified events) SHALL be omitted.

#### Scenario: Added events rendered

- **WHEN** a plan with one added event is rendered
- **THEN** the output contains `# Tracking Plan — <repo>`, the summary, the backticked event name, its owner metric, and each code location

#### Scenario: Empty sections omitted

- **WHEN** a plan has no modified and no removed events
- **THEN** the output contains no `## Modified events` and no `## Removed events` headings

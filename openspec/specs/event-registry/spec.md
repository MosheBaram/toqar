# event-registry Specification

## Purpose

TBD - created by syncing change phase-0-validation-toolkit. Update Purpose after review.

## Requirements

### Requirement: Common event envelope

Every TOQAR event SHALL carry a common envelope validated by `eventEnvelopeSchema`: `event_id` (UUID), `schema_version` (starting at `0.1.0`, exported as `SCHEMA_VERSION`), `timestamp` (ISO 8601 with offset), `task_id`, `run_id`, `task_type`, and an `agent` identity object (`name`, `version`). `session_id` MAY be present as the human-side bridge.

#### Scenario: Valid envelope accepted

- **WHEN** a payload contains all required envelope fields with valid values
- **THEN** `eventEnvelopeSchema.safeParse` succeeds

#### Scenario: Missing required envelope field rejected

- **WHEN** a payload omits a required envelope field (e.g. `task_id`)
- **THEN** `eventEnvelopeSchema.safeParse` fails

### Requirement: Exactly ten core events

The registry SHALL define exactly ten core event schemas, each extending the envelope: `task_started`, `task_completed`, `task_failed`, `task_abandoned`, `step_executed`, `handoff_to_human`, `human_approved`, `human_edited`, `human_overrode`, `feedback_given`. They SHALL be exposed as a Zod discriminated union `toqarEventSchema` (discriminator: `event`) and enumerated in `TOQAR_EVENT_NAMES`.

#### Scenario: Event names enumerated

- **WHEN** `TOQAR_EVENT_NAMES` is sorted
- **THEN** it equals exactly the ten core event names and nothing else

#### Scenario: Union routes by discriminator

- **WHEN** a valid `handoff_to_human` payload is parsed via `toqarEventSchema`
- **THEN** parsing succeeds and the parsed `event` field is `handoff_to_human`

#### Scenario: Unknown event rejected

- **WHEN** a payload carries an event name outside the ten (e.g. `page_view`)
- **THEN** `toqarEventSchema.safeParse` fails

### Requirement: Typed property specs per event

Each event schema SHALL validate its full property spec, including enum-constrained fields, and reject values outside the spec. In particular: `task_completed` carries verification (`verification`, `verifier`), duration, step and token totals, and `cost_usd`; `step_executed` carries `step_id`, `step_index`, `step_type`, tool name, latency, status, a structured `error`, and `retry_of_step_id` for loop/retry detection.

#### Scenario: Valid task_completed with cost metrics accepted

- **WHEN** a `task_completed` payload carries `verification: 'verified'`, `verifier`, `duration_ms`, `steps_total`, token totals, and `cost_usd`
- **THEN** `taskCompletedSchema.safeParse` succeeds

#### Scenario: Unknown enum value rejected

- **WHEN** a `task_completed` payload carries `verification: 'probably_fine'`
- **THEN** `taskCompletedSchema.safeParse` fails

#### Scenario: Tool-call step with error accepted

- **WHEN** a `step_executed` payload describes a failed tool call with `status: 'error'`, a structured `error` object, and `retry_of_step_id`
- **THEN** `stepExecutedSchema.safeParse` succeeds

### Requirement: No raw content or PII in event payloads

Event schemas SHALL NOT define fields that carry raw user content, prompts, or model outputs. Large or sensitive payloads SHALL be referenced by ID via `*_ref` string pointer fields into the customer's own storage.

#### Scenario: Sensitive payload referenced, not embedded

- **WHEN** an event needs to reference user-visible content (e.g. a feedback comment)
- **THEN** the schema exposes only a `*_ref` string field (e.g. `comment_ref`), never the content itself

### Requirement: snake_case naming

All event names and property names SHALL be `snake_case`.

#### Scenario: New event or property added

- **WHEN** an event or property is added to the registry
- **THEN** its name is `snake_case` (no camelCase or kebab-case identifiers in payloads)

### Requirement: Public schema spec documents only what exists

`packages/registry/README.md` SHALL document the TOQAR primitives (Task → Run → Step; Handoff; Session), the ten core events, and the five layers (T/O/Q/A/R) with how each headline metric derives from the events. It SHALL claim only implemented, verified behavior.

#### Scenario: Documented events exist

- **WHEN** the README lists an event
- **THEN** that event exists in `TOQAR_EVENT_NAMES` with a matching schema

#### Scenario: No aspirational claims

- **WHEN** the README describes a capability
- **THEN** that capability is implemented in this repo (no unbuilt features, no "enterprise-grade" claims)

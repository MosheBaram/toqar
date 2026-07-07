# registry-sync Specification

## ADDED Requirements

### Requirement: Registry-as-code file format

The customer-repo registry file (`analytics/registry.json` by convention, path overridable) SHALL contain a JSON array of registry entries, each validating against `registryEntrySchema`. The CLI SHALL reject a file with duplicate event names or invalid entries, reporting every issue with its array index.

#### Scenario: Invalid file rejected with locations

- **WHEN** the file contains one entry missing `journey` and two entries sharing an event name
- **THEN** `toqar sync` exits non-zero listing both problems with their indices, without contacting the backend

### Requirement: Diff rendered as a tracking plan

`toqar sync` SHALL compute the difference between the local file and the tenant's backend registry and present it as a tracking plan: local-only events under `added`, changed events under `modified`, backend-active events absent locally under `removed`. The plan SHALL validate against `trackingPlanSchema` and print via `renderTrackingPlan`. With no differences it SHALL say so and exit 0.

#### Scenario: Drift shown as reviewable plan

- **WHEN** the local file has one new event and one changed description
- **THEN** the output is the rendered tracking plan with one added and one modified event, and the process exits with the designated "diff present" code

#### Scenario: In sync

- **WHEN** local and backend registries are identical
- **THEN** the CLI reports no drift and exits 0

### Requirement: Apply pushes the diff

`toqar sync --apply` SHALL submit the computed plan to the backend's diff-application endpoint and report the applied counts. It SHALL refuse to apply if the diff was computed against a backend state that changed meanwhile (stale check), telling the user to re-run.

#### Scenario: Apply round-trip

- **WHEN** `--apply` runs on a diff with two added events
- **THEN** the backend registry gains both entries and a re-run reports no drift

### Requirement: Pull writes backend state to the file

`toqar sync --pull` SHALL write the tenant's backend registry to the local file (sorted by event name, stable formatting), making the repo the mirror. Pull and apply SHALL be mutually exclusive flags.

#### Scenario: Pull mirrors backend

- **WHEN** `--pull` runs against a backend with 12 entries
- **THEN** the file contains exactly those 12 entries and a re-run reports no drift

### Requirement: Configuration and credentials

The CLI SHALL read backend URL and tenant token from environment variables (documented names), never from committed files, and SHALL never print the token.

#### Scenario: Missing credentials

- **WHEN** the token variable is unset
- **THEN** the CLI exits non-zero with a setup hint and makes no network call

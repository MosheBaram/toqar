# Operator Access Inventory

Every credential and access grant an operator holds, with a review
cadence (spec: security-controls, Access-reviews). Departures and
rotations update this file **the same day**.

Review cadence: quarterly, plus on any operator change.
Last reviewed: 2026-07-09.

| Resource | Access type | Held by | Purpose | Rotation |
| --- | --- | --- | --- | --- |
| GitHub repo `MosheBaram/toqar` | admin | Moshe Baram | Source, CI, branch protection | GitHub-managed; PAT/SSH per device |
| Anthropic API | key | Moshe Baram | Instrumentation + analysis agents | Env-only; never committed (secret scan enforces) |
| Deploy VM (when provisioned) | SSH | (unassigned) | Host the ingestion plane | Per-device key; disable on departure |
| Postgres / ClickHouse (when provisioned) | connection string | (unassigned) | Control plane + events store | Env/secret storage; rotate on operator change |
| Slack webhooks (per tenant, when configured) | webhook URL | Toqar backend | Finding delivery | Per-tenant; rotate on suspicion |

## Rows to fill at deploy

The `(unassigned)` rows are created by the operator-gated deploy
(ingestion 5.1). Assigning them is part of that task's close-out, and
this file is updated in the same PR.

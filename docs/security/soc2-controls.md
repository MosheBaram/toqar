# SOC 2 Type 1 — Control Checklist

Living document (spec: security-controls). Updated at the close-out of
**every** OpenSpec change that touches a control's evidence. Status is
honest: `implemented` means enforced in code/config today; `partial`
means designed but deployment-dependent; `planned` means not yet built.
No control is marked implemented on the strength of a plan.

Last reviewed: 2026-07-09 (tenancy-and-security close-out).

## Access control

| Control | Status | Evidence source |
| --- | --- | --- |
| Tenant isolation at the application layer | implemented | Tenant-scoped routes (no tenant id in URLs); `packages/isolation-suite` attacks every surface with wrong-tenant/scope/absent/revoked creds each CI run |
| Tenant isolation beneath the app (defense in depth) | implemented | RLS policies on all ten tenant tables + non-owner `toqar_app` role (migration 007); `rls.test.ts` proves an unscoped query sees one tenant |
| Scoped, revocable credentials | implemented | `tenant_tokens` (hashed, scoped `events:write`/`api:full`, `revoked_at`); revocation immediate, rotation-without-downtime tested |
| Structural scoping of analytics queries | implemented | `compileMetric` throws without a tenant; MCP scopes by construction (one server per token) |
| Human/SSO identity for operators | planned | Bearer tokens suffice pre-customers; SSO is a GA (2.2) item |

## Change management

| Control | Status | Evidence source |
| --- | --- | --- |
| All changes reviewed via PR | implemented | `main` branch protection requires the `verify` check; force-push and deletion disabled (GitHub API confirms) |
| Automated verification gates merge | implemented | CI `verify` (typecheck + tests + anti-slop + secret scan) and, for ingestion, the compose `integration` job |
| No secrets in source | implemented | Secret-pattern scan in `scripts/anti-slop-check.sh` (CI step); catches AWS/GitHub/Anthropic/Slack tokens and private keys |
| Spec-tracked changes | implemented | Every change is an OpenSpec artifact set, archived with specs synced to `openspec/specs/` |

## Audit logging

| Control | Status | Evidence source |
| --- | --- | --- |
| Mutations are audited | implemented | `audit_log` append-only; operations: seed, put, add, modify, remove, seam_map, instrument_run, finding, autonomy, token |
| Audit records are immutable | implemented | No API route updates or deletes audit rows |
| Autonomy grants are attributable | implemented | `autonomy_grants` records actor + timestamp per grant; surfaced in the dial |

## Encryption

| Control | Status | Evidence source |
| --- | --- | --- |
| TLS in transit | partial | Terminated at the deploy proxy per `packages/pipeline/README.md`; not exercisable until the service is deployed |
| Encryption at rest (Postgres, ClickHouse, backups) | partial | Deployment-dependent; runbook specifies encrypted volumes + off-box encrypted backups; none provisioned yet |

## Backup / recovery

| Control | Status | Evidence source |
| --- | --- | --- |
| Off-box backups with a tested restore | planned | Procedure documented in the ingestion runbook; execution is the operator-gated deploy task (ingestion 5.1) |

## Open items before a Type 1 assertion

- Deploy the ingestion plane (operator-gated) → moves the two `partial`
  encryption rows and the backup row to `implemented` with real evidence.
- Decide SSO timing (currently `planned`; not blocking Type 1 scope).
- Select an auditor (G2 decision; this checklist is auditor-neutral).

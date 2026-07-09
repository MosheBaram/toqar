# Design — Tenancy and Security

## Context

Cross-cutting track opened by change 1.1's groundwork (hashed tokens, tenant-scoped routes, isolation tests). Runs alongside 1.2–1.5, hardening each layer as it lands. We hold source context; the threat model is leakage between tenants and operator-credential compromise.

## Goals / Non-Goals

**Goals:** isolation guaranteed at two layers everywhere (application + RLS/structural); token lifecycle; one adversarial suite as the standing proof; SOC 2 Type 1 evidence accumulating from now.
**Non-Goals:** SSO/user management UI (2.2); SOC 2 Type 2 (needs an observation window — starts after Type 1); pen-test engagement (schedule at G2).

## Decisions

### D1: RLS as the second layer, not a replacement

Application-level tenant checks remain the primary mechanism (they produce good errors); RLS policies (`tenant_id = current_setting('app.tenant')`) are the net beneath. The `SqlExecutor` seam gains a `withTenant` context so both PGlite tests and production set the same session variable.

### D2: Scoped tokens, same table

`tenants` token storage extends to `tenant_tokens` (token_hash, scope, issued/revoked timestamps) — migration keeps 1.1's tokens as `api:full`. Collector accepts `events:write`+; registry mutations require `api:full`. Revocation is a row update checked on every auth resolution (no token caching beyond seconds).

### D3: One adversarial package

`packages/isolation-suite`: table-driven attacks (surface × credential-type × route) run in CI. New surfaces must add themselves (spec makes it a shipping requirement) — the suite is the registry of attack coverage, reviewed at each change close-out.

### D4: SOC 2 checklist as a living doc

`docs/security/soc2-controls.md`: control → implementation → evidence source. Updated at close-out of every change (spec scenario). Evidence sources preferred where they already exist (audit tables, GitHub protected-branch settings, CI history, backup logs) — no new tooling until an auditor requires it.

### D5: Secret scanning in the existing gate

Add a secret-pattern scan to `scripts/anti-slop-check.sh`'s CI step (or gitleaks if patterns prove insufficient) — same fail-the-build posture as the slop gate.

## Risks / Trade-offs

- [RLS + PGlite compatibility] → PGlite supports RLS and session settings; verified in group 1 before rollout to other tables.
- [Sequencing against 1.3–1.5] → tasks explicitly ordered "after change X merges"; the suite grows with each, never blocks them upfront.

## Open Questions

- Auditor selection timing — decide at G2; checklist format kept auditor-neutral.

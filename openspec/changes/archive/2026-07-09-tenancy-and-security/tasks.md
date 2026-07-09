# Tasks — Tenancy and Security

> Cross-cutting: groups 1–2 run now; groups 3–5 follow the changes they harden. TDD throughout.

## 1. Token lifecycle (specs: tenancy, registry-backend delta)

- [x] 1.1 Migration: `tenant_tokens` (hash, scope, issued_at, revoked_at); 1.1 tokens migrated as `api:full`
- [x] 1.2 TDD issue/list(prefix-only)/revoke routes with audit; immediate-revocation and scoped-containment scenarios
- [x] 1.3 Commit, PR, merge

## 2. RLS + adversarial suite foundation (spec: tenancy)

- [x] 2.1 TDD `tenantTransaction` session context on the SqlExecutor seam (PGlite + postgres bindings; non-owner toqar_app role so policies actually apply)
- [x] 2.2 RLS policies on all ten tenant tables; application-bug-contained scenario (unscoped query sees one tenant), cross-tenant read/write rejection, audit invisibility. Store-wide adoption of tenantTransaction rides groups 3-4 hardening
- [x] 2.3 Scaffold `packages/isolation-suite`: table-driven attacks against registry API surfaces; wire into CI
- [x] 2.4 Commit, PR, merge

## 3. Harden ingestion (after change 1.3 merges)

- [x] 3.1 Collector auth honors scopes (`events:write`+ accepted; suite asserts it); adversarial suite covers collector /v1/events, /v1/traces, /v1/rejections + MCP
- [x] 3.2 Semantic-layer structural tenant scoping verified — compileMetric throws without a tenant (unscoped-query-unrepresentable scenario)
- [ ] 3.3 Backup encryption + restore drill documented and executed once — **operator-blocked**: the restore drill requires the provisioned datastores (ingestion 5.1); procedure documented in the pipeline runbook and controls checklist

## 4. Harden product surfaces (after change 1.5 merges)

- [x] 4.1 Adversarial suite gains MCP surface (attacker server returns zero victim findings; read-only surface asserted) and collector events:write acceptance
- [x] 4.2 Autonomy-grant audit verified end-to-end (autonomy.test.ts: grant -> audit record with actor); web dial confirm-to-change wired in findings-experience

## 5. SOC 2 evidence track (spec: security-controls)

- [x] 5.1 `docs/security/soc2-controls.md`: Type 1 control checklist mapped to evidence sources, honest implemented/partial/planned status
- [x] 5.2 Secret scan added to the CI gate (D5, verified catches AWS/GitHub/Anthropic/Slack/private-key patterns); TLS/at-rest posture documented in the controls checklist
- [x] 5.3 Operator access inventory + quarterly review cadence in docs/security/
- [x] 5.4 `openspec validate --strict`; root README security section (honest status); commit, PR, merge

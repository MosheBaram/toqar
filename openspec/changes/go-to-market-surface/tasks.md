# Tasks — Go-to-Market Surface

> Phase 2 change 2.2, gated by G2 (the most gated change — assumes paying intent and a cohort). TDD; each group ships through branch → PR → CI → merge. Reuses the instrumentation agent, web app, semantic layer, and tenancy machinery.

## 1. Self-serve onboarding (spec: onboarding)

- [x] 1.1 Control-plane migration: `onboarding_timeline` (per-tenant timestamps); store + audit
- [x] 1.2 Onboarding orchestrated by `toqar onboard`: real instrumentation-agent run proposes the plan (approve out of band -> collector data flows); apps/web renders honest timeline state in `apps/web` to a real instrumentation-agent run (plan proposal) → approve → collector data-flowing
- [x] 1.3 Unsupported-repo refusal at connect (no plan milestone); honest pending states (no fabricated success); honest pending states (no fabricated success)
- [x] 1.4 Timeline recorded per milestone; time-to-first-finding computed from real timestamps; time-to-first-finding computed and surfaced
- [x] 1.5 Commit, PR, merge

## 2. Billing (spec: billing)

- [x] 2.1 Scaffold `packages/billing`; usage meters over `toqar.events` — reconcile-to-source verified against real ClickHouse (events_ingested == direct count); usage meters over `toqar.events` (events, tasks, agent runs) — reconcile-to-source tests
- [x] 2.2 Tier definitions in code seeded from WTP; GET /v1/billing shows tier + refs; planFor computes usage-against-limit seeded from `docs/validation/scorecard.md` WTP; plan/usage-against-limit endpoint
- [x] 2.3 Stripe references only (customer_id/subscription_id) — no card data stored (asserted by a source scan and the store shape) (customer/subscription refs only; assert no card data stored)
- [x] 2.4 Tenant-isolated billing_accounts + billing_invoices (migration 010, RLS + grants); billing surfaces registered in the isolation suite (RLS + audit); register routes in `packages/isolation-suite`
- [x] 2.5 Commit, PR, merge

## 3. Public docs (spec: public-docs)

- [x] 3.1 Scaffold `apps/docs` (markdown content; schema-spec README as anchor) (static build; schema-spec README as anchor)
- [x] 3.2 Product docs (SDK, OTLP, MCP, onboarding) + one-post-per-TOQAR-layer content series with real metric definitions (SDK, OTLP, MCP, onboarding) + the one-post-per-TOQAR-layer content series with real metric definitions
- [x] 3.3 CI cross-reference gate: docs claims validated against TOQAR_EVENT_NAMES + semantic-layer catalog; the docs build fails on an aspirational claim (verified): documented event/metric names must exist in `TOQAR_EVENT_NAMES` + semantic-layer catalog; aspirational-doc-blocked scenario
- [x] 3.4 Commit, PR, merge

## 4. Opt-in benchmarking (spec: benchmarking-optin)

- [ ] 4.1 Migration: per-tenant benchmark opt-in state (audited); opt-in/opt-out endpoints
- [ ] 4.2 TDD cohort aggregation over opted-in tenants' semantic-layer results; non-opted-in exclusion
- [ ] 4.3 TDD k-anonymity: below-k suppression ("insufficient cohort"), no re-identification, reconcile-to-source
- [ ] 4.4 Benchmark view in `apps/web` (cohort distribution + own position; never another tenant's identity)
- [ ] 4.5 Commit, PR, merge

## 5. Design D3 + close-out

- [ ] 5.1 Run Claude Design prompt D3 (marketing site + experiment/benchmark views); sync into `skills/toqar-design`; update `docs/design/claude-design-prompts.md`
- [ ] 5.2 Wire marketing/benchmark views from the D3 components
- [ ] 5.3 G3 checklist review against `docs/roadmap.md`; READMEs, root README; `openspec validate --strict`; commit, PR, merge

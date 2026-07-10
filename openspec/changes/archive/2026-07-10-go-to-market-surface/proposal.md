# Go-to-Market Surface

## Why

The three product loops exist; "shipped" needs the surface around them so a stranger can become a paying customer without a human from Toqar in the loop. Phase 2 change 2.2 builds that surface: self-serve onboarding (connect repo → agent proposes plan → approve → data flows), usage-tiered billing anchored on the validation willingness-to-pay data, a public docs site with the TOQAR content series, and opt-in anonymized cross-tenant benchmarking — the long-term category moat the schema was designed for.

## What Changes

- Self-serve onboarding flow in `apps/web`: the D2 onboarding screens wired to real repo connection, the instrumentation agent's plan proposal, approval, and first-data confirmation. Metric: time-to-first-finding.
- New package `@toqar/billing`: usage metering (events ingested, tasks tracked, agent runs) and tier logic; integrates a payment provider (Stripe) rather than building payments.
- Public docs site (`apps/docs`): the schema spec as the anchor artifact plus the one-post-per-TOQAR-layer content series; static, publishable.
- New capability in the analysis/registry layer: opt-in anonymized cross-tenant benchmarking — a tenant that opts in contributes k-anonymized metric distributions and can see where it sits against the cohort.
- **Design D3**: marketing site + experiment/benchmark views (Claude Design; prompts doc updated).

## Capabilities

### New Capabilities

- `onboarding` — the self-serve connect→plan→approve→flowing flow with time-to-first-finding measured.
- `billing` — usage metering, tiers, and payment-provider integration.
- `public-docs` — the publishable docs/content site anchored on the schema spec.
- `benchmarking-optin` — opt-in, k-anonymized cross-tenant metric benchmarks.

### Modified Capabilities

None (consumes Phase 1 + 2.1 contracts; onboarding reuses the instrumentation agent and web app).

## Impact

- One new package (`billing`), one new app (`docs`), onboarding additions to `apps/web`, and a benchmarking capability spanning analysis + registry.
- Depends on Phase 1 and change 2.1 (experiment verdicts appear in benchmark/marketing views). Gated by G2; this is the plan.
- Billing touches money — payment provider integration only, never bespoke card handling; PCI stays with the provider.
- Benchmarking is opt-in and k-anonymized by construction — no tenant's raw numbers are ever exposed to another; this is a privacy-critical capability, specced accordingly.

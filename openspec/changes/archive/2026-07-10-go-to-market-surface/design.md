# Design — Go-to-Market Surface

## Context

The surface that turns the product into a business a stranger can buy. Builds on all of Phase 1 + 2.1. Reuses: the instrumentation agent (onboarding's plan proposal), `apps/web` (onboarding screens from D2), the semantic layer (billing meters + benchmarks are computed metrics), the tenancy machinery (RLS/audit/isolation-suite for billing + opt-in), and the schema spec (docs anchor). Design D3 covers marketing + benchmark views.

## Goals / Non-Goals

**Goals:** unassisted self-serve onboarding with time-to-first-finding measured; usage-tiered billing via a payment provider; a publishable docs/content site that can't drift from the code; privacy-safe opt-in benchmarking.
**Non-Goals:** bespoke payment/card handling (provider only); a CMS (static docs from markdown); public per-tenant data (benchmarks are k-anonymized aggregates); marketing-site *implementation* here (D3 produces it; wiring is light).

## Decisions

### D1: Onboarding reuses the instrumentation agent end-to-end

The D2 onboarding screens already model connect→plan→approve→flowing. This change wires them to the real `instrumentation-agent` run (plan proposal), the existing PR machinery (approve→PR), and the collector (data flowing) — no new agent, no new plan format. Time-to-first-finding is recorded as onboarding timestamps in the control plane. Honest pending states reuse the D2 empty-state discipline.

### D2: Billing meters from `toqar.events`, payments via Stripe

Usage is a semantic-layer-style query over the tenant's real events — a bill line reconciles to a query, same citation discipline as findings. Tiers are code (limits + prices) seeded from the validation WTP numbers. Stripe holds all card data; Toqar stores only `customer_id`/`subscription_id`. This keeps PCI scope with the provider and the "no fake numbers" rule covers billing too.

### D3: Docs as a static site with a code cross-reference gate

`apps/docs` builds static from markdown, anchored on the schema-spec README. A CI check cross-references documented event/metric names against `TOQAR_EVENT_NAMES` and the semantic-layer catalog — an aspirational doc fails the build. This is the anti-slop rule (no aspirational documentation) made mechanical for the public surface. Content series posts use real metric definitions.

### D4: Benchmarking is privacy-critical — opt-in + k-anonymity by construction

Two hard invariants in the spec: (1) no non-opted-in tenant contributes or sees anything; (2) every published cohort figure aggregates ≥ k tenants, so no raw value is re-identifiable. Cohorts below k return "insufficient cohort", never a number. Figures are computed from opted-in tenants' real semantic-layer results — the schema was designed for this, and it's the long-term category moat, but it ships behind these invariants or not at all.

### D5: Sequenced last, gated hard

This change assumes paying intent (billing) and a cohort (benchmarking) — both need real customers, which is exactly what G2/G3 gate. The plan exists now; execution is the most gated in the roadmap.

## Risks / Trade-offs

- [Billing bugs cost real money/trust] → meters reconcile to source queries in tests; Stripe is the system of record for charges; usage is read-only-derived, never hand-entered.
- [Benchmark re-identification] → k-anonymity is a tested invariant, not a guideline; below-k suppression is a first-class scenario; opt-in/out audited.
- [Docs drift] → the CI cross-reference gate makes drift a build failure, same posture as the anti-slop gate.

## Open Questions

- k value (≥ 5 floor; final value set when the opted-in cohort is real).
- Tier boundaries — seeded from validation WTP, tuned against actual usage distributions once customers exist.
- Marketing site hosting/CMS — decide with D3 output in hand.

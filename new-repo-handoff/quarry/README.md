# Quarry — files extracted from the abandoned `aialytics` repo

These are the only pieces of the old ~410k-line repo judged genuinely
reusable (assessed 2026-07-07). They are **reference seeds, not
drop-ins**: none of them ship in Phase 0. They become raw material for
the Phase 1 deterministic analysis layer (`analysis-primitives`) and
experiment plane, after decoupling.

| File | What's real in it | Feeds | Caveats before reuse |
| --- | --- | --- | --- |
| `anomaly-detection.ts` | z-score, Modified Z-score/MAD, IQR detection with rolling baselines (mean/stdDev/median) | analysis-primitives: anomaly detection | Imports from the old repo's `dashboard/src/services/*` — sever those; keep the pure detection functions |
| `ab-testing-framework.ts` | Sample-size calculation via z-scores, standard error, 95% confidence intervals | experiment plane stats | 1,468 lines of framework around ~200 lines of good math — extract the stats functions only. Phase 1 needs **sequential testing** on top; this is the classical baseline |
| `funnel-analysis-engine.ts` | Real funnel walk over sorted event arrays (`processUserJourney`): completed steps, drop-off, timing | analysis-primitives: funnels | Storage-agnostic already; rewrite data access to consume ClickHouse query results |
| `cohort-analysis-engine.ts` | Real cohort/retention computation over plain events | analysis-primitives: retention | Same as above |
| `analytics-types.ts` | Comprehensive typed vocabulary: `AnalyticsEvent`, `FunnelDefinition`, `CohortDefinition` | registry design reference | Modeled for web analytics (page_view/click), not agentic events — TOQAR supersedes the taxonomy; keep the definition-shape ideas (funnel/cohort as data) |
| `event-schemas.ts` + `event-validator.ts` | Zod event schemas with validation, business rules, rate limiting | registry validation patterns | Taxonomy is web-analytics; the *pattern* (schema + validator + business rules layered) is the useful part |
| `MetricsAggregator.ts` | Time-windowed aggregation: percentiles, rolling windows | analysis-primitives: windowing | Small and genuinely functional; strip dashboard coupling |

Everything else in the old repo — orchestrator, momind, management
simulation, dashboard, k8s/terraform, the wired Express pipeline — was
assessed as unsalvageable for this product (fake data, admitted mocks,
wrong domain). Do not go back for more without re-reading that
assessment.

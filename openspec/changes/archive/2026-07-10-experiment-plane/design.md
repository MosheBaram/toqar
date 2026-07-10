# Design — Experiment Plane

## Context

The third loop, built on all of Phase 1. Reuses: the instrumentation agent's implementer + PR assembly (variant PRs), the semantic layer (guardrail metrics per arm), the analysis agent's finding shape (experiments surface as `experiment` findings), the autonomy dial (level 2 = experiment PRs), and the registry backend (experiment history). Seed: `quarry/ab-testing-framework.ts` for the classical stats baseline.

## Goals / Non-Goals

**Goals:** always-valid sequential testing; flag-provider integration (no home-grown flags); the hypothesis→variant-PR→monitor→verdict loop with guardrails; experiment history compounding in the registry.
**Non-Goals:** a Toqar-owned flag store (integrate providers); auto-merge of variant PRs (review gate preserved); multi-variant/bandit optimization (two-arm ship/revert first; more arms is a later change); frequentist fixed-horizon tests (they break under agent peeking).

## Decisions

### D1: Sequential testing, not fixed-horizon — mSPRT / confidence sequences

An agent monitors continuously; every peek at a fixed-horizon test inflates alpha. We use always-valid inference (mixture SPRT / confidence sequences) so "stop the moment it's decisive" is statistically honest. `quarry/ab-testing-framework.ts` gives sample-size and z-score machinery as the classical baseline; the sequential layer is the extension. Alternative — Bayesian posteriors with a decision rule — is defensible but confidence sequences map more directly onto the "bounded false-positive under peeking" guarantee the spec makes.

### D2: Flags via a provider seam, PostHog + LaunchDarkly first

`FlagProvider` interface (assign, read exposure) with two adapters. Rationale: our target customers already run one of these; a bespoke flag store is undifferentiated surface we'd have to make reliable. The seam means a third provider is an adapter, not a rewrite. Unsupported-provider path refuses honestly (spec) rather than faking assignment.

### D3: Variants reuse the instrumentation PR machinery

A variant is code, and all code changes go through PRs (design principle 1). So the experiment agent calls the same `implementer`/`assemblePrBranch` the instrumentation agent uses, gated on autonomy level 2. No new PR path, no auto-merge — the human review gate is the product boundary, identical to instrumentation.

### D4: Guardrails are semantic-layer metrics per arm

TSR, CPCT, Override Rate already exist as compiled queries. The experiment joins exposure→arm and computes each guardrail per variant through the existing executor — no new metric code, no new event types. Guardrail breach = a sequential test on the guardrail crossing its harm boundary, independent of the target metric.

### D5: Experiments live in the registry backend

New `experiments` + `experiment_verdicts` tables, tenant-scoped, RLS + audit like everything else (the tenancy machinery already exists). Verdicts surface as `experiment`-variant findings so the feed, Slack, and MCP show them with zero new delivery code.

## Risks / Trade-offs

- [Sequential stats are subtle to get right] → pure functions with adversarial tests (A/A false-positive rate under heavy peeking is a first-class scenario); quarry baseline cross-checks the fixed-horizon limit case.
- [Provider APIs differ in exposure semantics] → the seam normalizes to (subject, variant, timestamp); adapter tests pin each provider's mapping.
- [A bad variant reaches production] → it's a reviewed, merged PR behind a flag with auto-stop guardrails; blast radius is the flag rollout percentage, and revert is a flag flip plus the standard PR revert.

## Open Questions

- Default harm thresholds per guardrail — set conservative defaults, make them per-experiment overridable; tune against the first real experiment (the DoD).
- Whether exposure is recorded via the SDK or reconstructed from the provider — decide with the first integrated provider in hand.

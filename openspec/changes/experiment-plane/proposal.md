# Experiment Plane

## Why

Two of the three product loops ship: Toqar instruments for you (PRs) and analyzes for you (findings). The third — it *iterates* for you — is the moat, because experiment outcomes accumulate in the registry and compound. Phase 2 change 2.1 closes the loop: a finding becomes a hypothesis, the instrumentation agent's PR machinery ships a guarded variant, sequential-testing stats monitor it continuously (fixed-horizon tests break under the peeking an agent does by design), and the verdict is written back to the registry.

## What Changes

- New package `@toqar/experiments`: sequential-testing statistics (mSPRT/always-valid confidence sequences) extending the classical baseline in `new-repo-handoff/quarry/ab-testing-framework.ts`. Pure functions, no LLM.
- New package `@toqar/experiment-agent`: the hypothesis → variant-PR → monitor → verdict loop, reusing the instrumentation agent's implementer/PR assembly and the analysis layer's metrics as guardrails.
- Flag-provider integration first (PostHog, LaunchDarkly) — no home-grown flags until a customer forces it.
- Registry backend gains experiment records and verdicts (the compounding-context store extends to experiment history).
- Every experiment carries default guardrails — TSR, CPCT, Override Rate — that can auto-stop a variant.
- Autonomy dial gains its top rung meaning: experiment PRs require level 2.

## Capabilities

### New Capabilities

- `sequential-stats` — always-valid sequential testing over metric streams: continuous monitoring without alpha inflation, effect estimates with confidence sequences.
- `flags-integration` — a provider seam over PostHog/LaunchDarkly: assign variants, read exposure, no bespoke flag store.
- `experiment-agent` — the closed loop: hypothesis from a finding, variant PR via the instrumentation machinery, continuous guarded monitoring, verdict to the registry.

### Modified Capabilities

- `registry-backend` — experiment + verdict records with tenant isolation and audit (new requirement; existing behavior unchanged).

## Impact

- Two new packages; consumes `@toqar/experiments`←`quarry` stats, `@toqar/analysis` (guardrail metrics), `@toqar/instrumentation-agent` (PR machinery), the registry service API.
- Depends on all of Phase 1 (shipped). Gated by G2 in the roadmap — this change is the plan; execution waits for the gate.
- Autonomy: experiment PRs are the level-2 grant already modeled in the dial — no new permission concept, just its first real consumer.
- No auto-merge, ever: the human review gate on variant PRs is preserved exactly as for instrumentation PRs.

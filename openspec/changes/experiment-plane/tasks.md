# Tasks — Experiment Plane

> Phase 2 change 2.1, gated by G2. TDD; each group ships through branch → PR → CI → merge. Reuses Phase 1 machinery (instrumentation PR assembly, semantic layer, autonomy dial, registry backend).

## 1. Sequential statistics (spec: sequential-stats)

- [x] 1.1 Scaffold `packages/experiments` (zod-only runtime; no LLM deps)
- [x] 1.2 TDD always-valid sequential test (mSPRT / confidence sequence): decision + effect estimate + interval + per-arm n
- [x] 1.3 TDD the peeking guarantee: A/A stream evaluated every observation keeps cumulative false-positive ≤ alpha; true-effect stream concludes and holds
- [x] 1.4 Extract classical baseline from `quarry/ab-testing-framework.ts` (sample size, z-score, CI) with provenance docblock; cross-check the fixed-horizon limit
- [x] 1.5 Commit, PR, merge

## 2. Experiment records (spec: registry-backend delta)

- [x] 2.1 Migration: `experiments` + `experiment_verdicts` (tenant-scoped, RLS + audit)
- [x] 2.2 TDD store + routes: create/transition/list experiments, write/read verdicts; lifecycle audit; tenant-isolation scenario
- [x] 2.3 Register the new routes in `packages/isolation-suite` (the standing adversarial suite)
- [x] 2.4 Commit, PR, merge

## 3. Flag integration (spec: flags-integration)

- [ ] 3.1 `FlagProvider` seam + PostHog adapter; unsupported-provider refusal
- [ ] 3.2 LaunchDarkly adapter
- [ ] 3.3 Exposure→arm join verified against the ClickHouse events table (integration job): per-arm TSR/CPCT/Override computable with no new event types
- [ ] 3.4 Commit, PR, merge

## 4. Experiment agent (spec: experiment-agent)

- [ ] 4.1 Scaffold `packages/experiment-agent`; hypothesis-from-finding record creation with cited premise
- [ ] 4.2 Variant PR via the instrumentation implementer/PR assembly, gated on autonomy level 2 (level-1 refusal scenario)
- [ ] 4.3 Monitor loop: sequential test on target metric + guardrails (TSR/CPCT/Override); guardrail auto-stop scenario
- [ ] 4.4 Verdict written to the registry and surfaced as an `experiment` finding (feed/Slack/MCP inherit it); inconclusive-stays-inconclusive scenario
- [ ] 4.5 Commit, PR, merge

## 5. End-to-end + close-out

- [ ] 5.1 E2E on the fixture app: finding → hypothesis → variant PR (level 2) → simulated exposure/outcome stream → sequential verdict → registry record → experiment finding
- [ ] 5.2 MCP: expose experiments/verdicts read-only (`list_experiments`, `get_verdict`) with the citation contract
- [ ] 5.3 READMEs, root README, `openspec validate --strict`; commit, PR, merge

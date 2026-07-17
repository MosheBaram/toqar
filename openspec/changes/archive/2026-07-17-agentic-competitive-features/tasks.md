# Tasks — Agentic Competitive Features

> Sequenced per design D1: table-stakes debt first, moat last mile second. Each
> group is independently shippable through branch → PR → CI → merge. TDD
> throughout; judge signals never enter the citation contract (design D2).

## 1. Eval framework (spec: eval-framework)

- [x] 1.1 Score/dataset/evaluator storage: append-only eval scores keyed to trace/run with the full version tuple (prompt/model/agent/dataset/evaluator = rubric hash + judge model) captured at score time; TDD
- [x] 1.2 Deterministic code scorers + LLM-as-judge runner (async, per-tenant sampling); judge runs are themselves traced (cost/latency visible); TDD with a fixture judge
- [x] 1.3 Trajectory-level scoring over ordered run steps; TDD the mid-run-corruption case output-only checks miss
- [x] 1.4 One-action prod-trace → versioned regression dataset; offline eval runs over datasets with tolerance thresholds
- [x] 1.5 Feedback/annotation linkage: `feedback_given` + reviewer labels as ground truth; judge-vs-human agreement tracking; override/edit signals with documented asymmetry
- [x] 1.6 CI eval gate: pass/fail check API with per-scorer results (evaluateGate; failing scorers + cases named) — a customer wires it into any CI runner
- [x] 1.7 Judge signals structurally excluded from the `q_<hash>` citation contract (no citation surface exists on a score; evaluator identity mandatory) — UI labeling rides the run drill-down (group 2)
- [x] 1.8 Commit, PR, merge (per sub-slice as sensible)

## 2. Agent-native schema + trace explorer (spec: trace-explorer)

- [x] 2.1 First-class run reconstruction over events/OTLP: agents, sub-agents, sessions/turns where human-shaped, headless runs without fabricated sessions; materialized-path sort for O(1) waterfalls; TDD (wants data-plane-hardening group 1 first)
- [x] 2.2 Metrics compute over the same entities (per-agent override rate, per-tool failure by agent); TDD reconciliation with existing metrics
- [x] 2.3 Run drill-down: MCP `get_run` tool (the agent-native query surface with ClickHouse access) + `RunWaterfall` component in apps/web over the tested `waterfallRows` helper *(findings→run deep-links need run refs on the finding schema — deferred with the alerting UI wiring)*
- [x] 2.4 Commit, PR, merge

## 3. Failure/topic clustering (spec: failure-clustering)

- [x] 3.1 Deterministic signature clustering over failures/overrides (member counts computed, members enumerable; TDD verifiability + determinism); rows come from a cited query (compileFailureRowsQuery) *(LLM relabeling is an optional later polish; membership math never moves to a model)*
- [x] 3.2 Significant clusters publish as findings through the citation gate; TDD an uncited cluster number is rejected
- [x] 3.3 Commit, PR, merge

## 4. Alerting + ingest breadth (specs: alerting, otel-traces delta, sdk-node delta)

- [x] 4.1 Alert config (thresholds + anomaly/changepoint primitives + eval-score regressions), per-alert Slack/webhook routing; evaluation/delivery lifecycle recorded, failures visible; TDD
- [x] 4.2 Stable `gen_ai.*` client-span import pinned to a semconv version; unknown attrs preserved, unmapped counted; TDD with OpenLLMetry-shaped fixtures
- [x] 4.3 SDK framework wrappers (Anthropic, OpenAI, Vercel AI SDK, LangChain/LangGraph) with the SDK's never-block guarantees; shared registry contract with agent-planned events; TDD
- [x] 4.4 Commit, PR, merge

## 5. Outcome join + agent-native pricing (specs: semantic-layer delta, billing delta)

- [x] 5.1 Outcome-join: `quality_cohort_retention` (weekly active accounts cohorted by agent-override — the join no competitor owns), parameterized/cited/deterministic and in the R-layer catalog; CPCT-per-task-type comparability comes free via segmentBy (existing); further cohort cuts follow the same pattern
- [x] 5.2 Per-completed-task pricing dimension reconciling to recorded task events; TDD invoice-count == recorded-count
- [x] 5.3 Commit, PR, merge

## 6. Guardrailed closed loop (spec: autonomous-rollout)

- [x] 6.1 Autonomy level 3 on the existing dial (explicit, audited, revocable); TDD level-2 never auto-promotes
- [x] 6.2 Tenant-declared change classes + blast-radius limits; out-of-class falls back to the human path (audited); TDD
- [x] 6.3 Canary → sequential monitoring with default guardrails → auto-promote on valid win / auto-rollback on breach; every transition audited with cited evidence; verdict to registry; TDD breach-rolls-back and win-promotes
- [x] 6.4 Kill switch: revoking level 3 halts in-flight rollouts safely; TDD
- [x] 6.5 Commit, PR, merge

## 7. Close-out

- [x] 7.1 Docs: READMEs for new surfaces, root README, architecture notes; drift check green
- [x] 7.2 New tenant-facing surfaces registered in the isolation suite (alert config + eval APIs registered with their groups; the explorer is MCP-served — per-token scoped by construction, covered by the MCP isolation tests)
- [x] 7.3 `openspec validate --strict`; full gates green; commit, PR, merge

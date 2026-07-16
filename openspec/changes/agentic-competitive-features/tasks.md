# Tasks — Agentic Competitive Features

> Sequenced per design D1: table-stakes debt first, moat last mile second. Each
> group is independently shippable through branch → PR → CI → merge. TDD
> throughout; judge signals never enter the citation contract (design D2).

## 1. Eval framework (spec: eval-framework)

- [ ] 1.1 Score/dataset/evaluator storage: append-only eval scores keyed to trace/run with the full version tuple (prompt/model/agent/dataset/evaluator = rubric hash + judge model) captured at score time; TDD
- [ ] 1.2 Deterministic code scorers + LLM-as-judge runner (async, per-tenant sampling); judge runs are themselves traced (cost/latency visible); TDD with a fixture judge
- [ ] 1.3 Trajectory-level scoring over ordered run steps; TDD the mid-run-corruption case output-only checks miss
- [ ] 1.4 One-action prod-trace → versioned regression dataset; offline eval runs over datasets with tolerance thresholds
- [ ] 1.5 Feedback/annotation linkage: `feedback_given` + reviewer labels as ground truth; judge-vs-human agreement tracking; override/edit signals with documented asymmetry
- [ ] 1.6 CI eval gate: pass/fail check API with per-scorer results; example GitHub Action
- [ ] 1.7 Product surfaces: judge signals visibly labeled with evaluator identity, excluded from `q_<hash>` claims (findings feed + web)
- [ ] 1.8 Commit, PR, merge (per sub-slice as sensible)

## 2. Agent-native schema + trace explorer (spec: trace-explorer)

- [ ] 2.1 First-class run reconstruction over events/OTLP: agents, sub-agents, sessions/turns where human-shaped, headless runs without fabricated sessions; materialized-path sort for O(1) waterfalls; TDD (wants data-plane-hardening group 1 first)
- [ ] 2.2 Metrics compute over the same entities (per-agent override rate, per-tool failure by agent); TDD reconciliation with existing metrics
- [ ] 2.3 Run drill-down view in `apps/web`: waterfall, tool/model/token/cost context, error+retry highlighting, human events in place; findings link into runs
- [ ] 2.4 Commit, PR, merge

## 3. Failure/topic clustering (spec: failure-clustering)

- [ ] 3.1 Clustering job over failures/overrides/low-scores/intents (LLM-assisted grouping allowed; member counts computed, enumerable); TDD membership verifiability
- [ ] 3.2 Significant clusters publish as findings through the citation gate; TDD an uncited cluster number is rejected
- [ ] 3.3 Commit, PR, merge

## 4. Alerting + ingest breadth (specs: alerting, otel-traces delta, sdk-node delta)

- [ ] 4.1 Alert config (thresholds + anomaly/changepoint primitives + eval-score regressions), per-alert Slack/webhook routing; evaluation/delivery lifecycle recorded, failures visible; TDD
- [ ] 4.2 Stable `gen_ai.*` client-span import pinned to a semconv version; unknown attrs preserved, unmapped counted; TDD with OpenLLMetry-shaped fixtures
- [ ] 4.3 SDK framework wrappers (Anthropic, OpenAI, Vercel AI SDK, LangChain/LangGraph) with the SDK's never-block guarantees; shared registry contract with agent-planned events; TDD
- [ ] 4.4 Commit, PR, merge

## 5. Outcome join + agent-native pricing (specs: semantic-layer delta, billing delta)

- [ ] 5.1 Outcome-join metrics: quality-cut retention/activation cohorts, task-depth vs quality, CPCT as comparable unit economics — parameterized, cited, deterministic; TDD reconciliation
- [ ] 5.2 Per-completed-task pricing dimension reconciling to recorded task events; TDD invoice-count == recorded-count
- [ ] 5.3 Commit, PR, merge

## 6. Guardrailed closed loop (spec: autonomous-rollout)

- [ ] 6.1 Autonomy level 3 on the existing dial (explicit, audited, revocable); TDD level-2 never auto-promotes
- [ ] 6.2 Tenant-declared change classes + blast-radius limits; out-of-class falls back to the human path (audited); TDD
- [ ] 6.3 Canary → sequential monitoring with default guardrails → auto-promote on valid win / auto-rollback on breach; every transition audited with cited evidence; verdict to registry; TDD breach-rolls-back and win-promotes
- [ ] 6.4 Kill switch: revoking level 3 halts in-flight rollouts safely; TDD
- [ ] 6.5 Commit, PR, merge

## 7. Close-out

- [ ] 7.1 Docs: READMEs for new surfaces, root README, architecture notes; drift check green
- [ ] 7.2 New tenant-facing surfaces registered in the isolation suite (alert config, eval APIs, explorer routes)
- [ ] 7.3 `openspec validate --strict`; full gates green; commit, PR, merge

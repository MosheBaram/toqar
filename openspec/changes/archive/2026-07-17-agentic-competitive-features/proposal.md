# Agentic Competitive Features

## Why

The market research (`docs/research/2026-07-16-market-landscape.md`, 14 products
across classic analytics and LLM-observability, cited) confirms Toqar's wedge
and exposes its debt:

- **The wedge is open and citable**: nobody joins agent telemetry to
  product/business outcomes (Langfuse ships an *outbound Mixpanel integration*
  because retention questions are out of its scope); nobody does cross-tenant
  benchmarking; nobody closes the loop (PostHog: "nothing reaches production on
  its own"; LangSmith Engine and Arize Signal stop at a draft PR; Statsig
  automates config rollouts only).
- **But the first half of our loop is matched**: autonomous narrative analysis
  now ships at LangSmith Engine, Arize Signal, and Datadog Patterns, and
  PR-based instrumentation at PostHog and Arize. Amplitude's beta Agent
  Analytics is the closest data-model rival and is not yet GA — this is a race.
- **Table-stakes debt**: without an eval framework, a trace viewer, and a
  first-class agent schema, Toqar cannot credibly cover the Q, A, and R of its
  own TOQAR framework.

This change plans the ranked backlog: close the table-stakes debt first, then
extend the two verified moats (guardrailed closed loop; outcome join +
benchmarking).

## What Changes

- **Eval framework (new `eval-framework`).** Online scoring of live traces
  (LLM-as-judge + deterministic code scorers) and offline evals on curated
  datasets; one-click prod-trace → regression dataset; human feedback/annotation
  feeding the same datasets; a CI eval gate. Non-negotiables from the
  governance research: the full version-tuple (prompt/model/agent/dataset +
  evaluator version) captured at score time; trajectory-level evaluation (not
  output-only — output-only passes 20–40% more than trajectory reveals); judge
  scores are directional, never presented as deterministic truth (they carry
  their judge/version and stay out of the citation-backed numeric contract).
- **Agent trace explorer (new `trace-explorer`).** First-class
  session/turn/span/agent schema over the existing events + OTLP traces —
  including **headless/background/multi-agent runs** (whitespace: every
  competitor assumes chat-shaped sessions) — with a waterfall/tool-call
  drill-down view answering "why did this run fail?".
- **Autonomous failure/topic clustering (new `failure-clustering`).** Cluster
  recurring failures and intents without predefined categories; clusters become
  cited findings — surfacing unknown-unknowns (the eval-first tools' admitted
  blind spot).
- **Alerting (new `alerting`).** Thresholds + the existing
  anomaly/changepoint primitives wired to configurable routing
  (Slack/webhook), on TOQAR metrics and eval-score regressions.
- **Guardrailed closed loop (new `autonomous-rollout`).** The moat's last
  mile, shippable only with safety framing: an explicit autonomy level 3 where
  a variant that wins its sequential test auto-promotes (and a guardrail
  breach auto-rolls-back) within declared blast-radius limits and scoped
  change classes, every action audited and citation-backed.
- **Ingest breadth (modify `otel-traces`, `sdk-node`).** Import the now-stable
  OTel GenAI client-span conventions (`gen_ai.*` tokens/cost/latency) while
  keeping our own agent-semantics superset (the agent layer of the spec is
  still experimental); drop-in auto-instrument wrappers for the major
  frameworks — a zero-PR five-minute first-data path complementing the
  PR-based instrumentation agent.
- **Outcome join (modify `semantic-layer`).** Agent quality → business outcome
  as first-class, citation-backed metrics: retention/activation cohorts cut by
  agent-quality signals, cost-per-completed-task as unit economics.
- **Agent-native pricing (modify `billing`).** A per-completed-task/per-run
  billing option — every competitor charges per event/span/MB, which punishes
  agentic workloads; pricing is itself a differentiator.

Explicitly sequenced later (not specced here): prompt management/playground,
self-host/BYOC, warehouse-native export. Real but behind the above.

## Capabilities

### New Capabilities

- `eval-framework` — online + offline evals, scorers, datasets,
  feedback/annotation, CI gate, version-tuple + trajectory discipline.
- `trace-explorer` — agent-native session/turn/span schema (incl. headless)
  and the run drill-down view.
- `failure-clustering` — autonomous failure/topic clustering feeding cited
  findings.
- `alerting` — threshold/anomaly alerts with configurable routing.
- `autonomous-rollout` — the guardrailed autonomy-level-3 closed loop.

### Modified Capabilities

- `otel-traces` — stable GenAI client-span import + agent-semantics superset.
- `sdk-node` — framework auto-instrument wrappers (zero-PR path).
- `semantic-layer` — outcome-join metrics (quality → retention/activation;
  unit economics).
- `billing` — per-task/per-run pricing option.

## Impact

- Builds on the shipped platform end to end: evals and clustering consume the
  data plane (and want `data-plane-hardening`'s typed columns first); the
  closed loop extends the experiment plane + autonomy dial; the trace explorer
  extends `apps/web`; alerting extends the analysis primitives + Slack
  delivery.
- The deterministic-numbers contract is preserved: LLM-judge scores are a new,
  clearly-labeled signal class carrying judge identity/version — they never
  masquerade as citation-backed metrics, and no customer-facing arithmetic
  moves to an LLM.
- Autonomy level 3 is opt-in per tenant via the existing audited dial;
  everything below the new level behaves exactly as today.

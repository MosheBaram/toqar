# Design — Agentic Competitive Features

Grounded in `docs/research/2026-07-16-market-landscape.md` (competitive facts),
`docs/research/2026-07-16-agent-governance.md` (eval/data-model best practice),
and `docs/reviews/2026-07-16-platform-review.md`.

## Context

Toqar's two verified moats are (a) the closed loop that *implements* — every
competitor stops at a human-gated draft PR — and (b) the outcome join +
cross-tenant benchmarking, which nobody in either cohort offers (Langfuse's
outbound Mixpanel integration is the citable admission). But the research also
shows the first half of the loop is now matched (LangSmith Engine, Arize
Signal, Datadog Patterns), and three table-stakes are missing: evals, a trace
viewer, and an agent-native schema. Amplitude's Agent Analytics — the closest
data-model rival — is still design-partner beta. The strategy: pay the
table-stakes debt fast, then ship the last mile nobody has.

## Decisions

### D1: Sequencing — table-stakes first, moat last mile second

Order: eval-framework → trace-explorer (schema + view) → failure-clustering →
alerting + ingest breadth → outcome join + pricing → autonomous-rollout. Evals
first because Q-layer credibility gates everything (and clustering/alerting
consume eval signals); the closed loop last because it must ride proven evals,
guardrails, and clustering to be safe — and because rushing it unsafely would
convert our differentiator into a liability.

### D2: Judge scores are a second signal class, never metrics

The deterministic-numbers contract is the brand. LLM-judge output enters as a
new, visibly-labeled signal class carrying evaluator identity/version (rubric
hash + judge model), excluded from the `q_<hash>` numeric citation contract.
Version-tuple capture at score time (prompt/model/agent/dataset/evaluator) is
non-negotiable — without it drift is uninterpretable (the governance research's
"single most common failure mode"). Trajectory-level evaluation is the
default posture; output-only checks pass 20–40% more than trajectories reveal.

### D3: One agent schema for metrics and explorer, headless-first

The trace explorer does not get its own parallel data model: session/turn/
span/agent become first-class over the same events the 21 metrics compute on
(and want `data-plane-hardening`'s typed columns beneath them). Headless/
background/multi-agent runs are modeled without fabricating sessions — the
whitespace every chat-shaped competitor (Amplitude Turns, Weave sessions)
leaves open. Adopt the useful pieces of the vendor consensus: a materialized-
path (`dotted_order`-style) sort key for O(1) waterfalls; handoff/override/
feedback stay first-class event rows (aggregable), not buried span annotations.

### D4: The closed loop ships as "guardrails first"

Level 3 is only a moat with a safety story stronger than the competitors'
human gate: explicit audited grant (extending the existing dial), tenant-
declared change classes and blast-radius limits, canary + always-valid
sequential verdicts + default guardrails (TSR/CPCT/Override Rate),
auto-rollback on breach, and a kill switch. Marketing framing follows the
code: "autonomous within limits you set, with rollback faster than a human."

### D5: Meet the ecosystem where it standardized

Import the stable OTel GenAI client-span layer (tokens/cost/latency interop
for free — OpenLLMetry-instrumented apps land without our SDK), pinned to a
semconv version at ingest; keep agent semantics as our versioned superset
(the spec's agent layer is still experimental). Framework wrappers give the
zero-PR five-minute path PostHog's 35 integrations make table-stakes; the
instrumentation agent stays the deep path — wrappers feed the same registry
contract so the two never fork.

### D6: Pricing is product

A per-completed-task price reconciling to recorded task events (meters
discipline) — every competitor bills per event/span/MB, which reads as
punitive to exactly our ICP. Cheap to build; differentiating to say.

## Risks / Trade-offs

- [LLM-judge cost at 100% sampling] → per-tenant sampling rates; the
  governance research's "start full, dial down on stability" posture; judge
  runs are themselves traced (cost visible).
- [Autonomy level 3 incident] → the D4 guardrail stack, opt-in-only, scoped
  change classes, kill switch; an incident with rollback evidence is
  survivable, an ungoverned one is not.
- [Amplitude ships Agent Analytics GA first] → their model is chat-shaped and
  enterprise-motioned; headless-first schema + startup-motion + closed loop
  keep differentiation even if they GA first.
- [Scope breadth] → this change is deliberately a sequence of independently
  shippable capabilities, each its own branch→PR→merge; nothing blocks on the
  whole.

## Deferred (explicitly)

Prompt management/playground, CI-integrated self-host/BYOC, and warehouse-
native export are real asks (Langfuse/Braintrust/Statsig make them
table-stakes upmarket) but sequenced behind the above; they get their own
changes when pulled.

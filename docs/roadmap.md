# Toqar Roadmap — from validation to shipped product

This is the full phase plan from today until Toqar is a fully functional,
shipped product. It is a **plan, not a claim**: nothing below exists until
its phase runs. Each phase becomes one or more OpenSpec changes
(`/opsx:new <change>`) **only when its entry gate opens** — pre-building
gated work is the failure mode this repo was founded against.

The business side — ICP, positioning, pricing, channels, the 90-day
launch sequence — is `docs/business/go-to-market.md` (added 2026-07-17);
this file remains the build plan.

Main specs in `openspec/specs/` are the contract for what exists today:
`event-registry`, `tracking-plan`, `instrumentation-skill`,
`validation-ops`, `quality-gates`.

```
 TODAY ──▶ Phase 1 (6 changes) ──G2──▶ Phase 2 ──▶ Phase 3 ──G3──▶ SHIPPED
           platform core              closed loop   hardening +
           + design D2                + GA, D3      competitive depth
   ║
   ╚═ parallel: Phase 0.5 validation (design partners) — G1 signals
      steer positioning and priorities; they no longer gate the build
```

*(Phases 1–3 are built and archived — see the amendment log. G3's
remaining items are operational, not code.)*

## Amendment log

- **2026-07-07 — founder decision: build before validation.** Phase 1
  starts now, ahead of the design-partner test. G1 is demoted from build
  gate to steering signal (see the amended gate text below). Design D2
  is unlocked. Recorded deliberately: this inverts the original
  "validation gates platform code" rule from the aialytics autopsy — the
  risk accepted is building on unvalidated demand; the mitigations kept
  are specs-first changes, the quality gates, and running validation in
  parallel so the steering signals still arrive.

- **2026-07-10 — founder decision: build Phase 2 ahead of G2.** Same
  posture extended to the closed loop and GA surface: G2 is demoted from
  build gate to steering signal. Phase 2 (experiment-plane,
  go-to-market-surface) is implemented now on founder conviction; G2's
  criteria (a converted paying customer, e2e flow) still steer
  prioritization and remain the honest measure of demand. The
  deployment-shaped work (billing charges, benchmarking cohorts, the
  production deploy) stays operator-gated regardless — building the code
  does not provision infrastructure or take real money.

- **2026-07-16 — founder directive: best-in-world bar; Phase 3
  commissioned.** With Phase 0–2 feature-complete, the founder set the
  bar at category-best and commissioned a full pass: a code-grounded
  platform review (`docs/reviews/2026-07-16-platform-review.md`), deep
  persistence research, 14-competitor market research, and agent-data
  governance research (`docs/research/`). Outcome: Phase 3 below, planned
  as three strict-validated OpenSpec changes. Notable review finding
  pulled to the front of the queue: RLS is built but disengaged on the
  served path — a trust fix, not a scale fix.

---

## Phase 0.5 — Run the validation (parallel track, weeks 0–8)

The work is operational and lives in `docs/validation/`. *Amended
2026-07-07: runs in parallel with Phase 1 rather than ahead of it.*

| # | Work | Deliverable |
| --- | --- | --- |
| 0.5.1 | Recruit 5 design partners (agentic startups, pre-seed–Series A, TS stacks, live users, reachable founders) | 5 completed `intake-template.md` docs |
| 0.5.2 | Week-1 instrumentation PR per partner via `instrument-agentic-app` skill | merged PRs (A1 counter) |
| 0.5.3 | Weekly insight reports, weeks 2–5; log every inbound question verbatim | `question-log.md` entries, saved queries |
| 0.5.4 | Skill fixes discovered on real repos | commits + `DRYRUN.md`-style records |
| 0.5.5 | **Design D1** (parallel): brand foundation + report template via Claude Design — see `docs/design/claude-design-prompts.md`, Prompt D1 | Claude Design project `toqar-brand`; tokens adopted by weekly reports |
| 0.5.6 | Week-6 exit interviews: Sean Ellis + WTP number | `scorecard.md` final row |

**Gate G1 (week 6–8, from `docs/validation/scorecard.md`) — amended
2026-07-07: a steering signal, no longer the Phase 1 build gate:**

- A1 red (≤2/5 PRs merged) → the instrumentation wedge fails; pause the instrumentation-agent change (1.2) and rework the skill before productizing it.
- A2 red (≤1/5 partners with ≥2 unprompted questions) → insights don't pull; company-vs-consulting decision, now made with platform sunk cost on the table — treat as a stop-and-decide moment for Phase 1 spend.
- A3 <25% agent-shaped → keep the tech, pivot positioning to "better Mixpanel client"; re-scope remaining Phase 1 changes before continuing.
- **G1 green = WTP ≥2 partners at ≥$200/mo AND A1/A2 not red → conviction confirmed; continue as planned.**

---

## Phase 1 — Platform core (entry: founder decision, 2026-07-07 — see amendment log)

Six changes, strict order (each depends on its predecessors). Per change:
run `/opsx:new`, write full specs from the sketch below, implement via the
established loop (branch → TDD → PR → CI green → merge). The `tenancy`
track runs cross-cutting from change 1.1 onward.

### Change 1.1 `registry-service` — schema registry backend

The registry stops being only a library and becomes the shared contract
synced between customer repos and our backend.

- **Capabilities:** `registry-service`, `registry-sync`
- **Key requirements (sketch):**
  - Postgres-backed registry API: CRUD for registry entries per tenant, versioned; every entry keeps `journey`, `owner_metric`, `hypothesis` (the compounding-context moat starts here).
  - Registry-as-code sync: a CLI (`toqar sync`) that diffs `analytics/registry.{json,ts}` in the customer repo against the backend and applies tracking-plan diffs — reusing `trackingPlanSchema` verbatim.
  - TOQAR default taxonomy shipped as the initial registry state for every new tenant.
  - Experiment verdicts and instrumentation history are registry entries' audit trail (append-only).
- **DoD:** a design partner's repo syncs registry state bidirectionally; all mutations validated by `@toqar/registry` schemas; multi-tenant rows isolated (see 1.6).

### Change 1.2 `instrumentation-agent` — productize the concierge skill

- **Capabilities:** `instrumentation-agent`
- **Key requirements (sketch):**
  - The `instrument-agentic-app` skill's four phases become a hosted agent (Anthropic API) triggered per repo, producing the same two artifacts: tracking-plan diff (review gate) → PR.
  - Scope: TypeScript/React frontends + **one** Node backend framework (choose from partner evidence — likely Fastify or Express). Depth over breadth; a second framework requires a new change.
  - Every agent run stores its seam map in the registry service (accumulated context).
  - Quality bar unchanged and now measured: PR merge rate is a product metric.
- **DoD:** one-click instrumentation on a fresh partner repo with merge-ready PR; skill remains the fallback path.

### Change 1.3 `ingestion-plane` — events actually land with us

- **Capabilities:** `sdk-node`, `collector`, `stream-pipeline`, `otel-traces`
- **Key requirements (sketch):**
  - Lightweight TS SDK: the shipped version of the analytics-wrapper template (same shape: typed per-event functions, single `track()`, fire-and-forget, `ANALYTICS_DISABLED` kill switch), now pointing at our collector.
  - Fastify HTTP collector → Redpanda → ClickHouse. Boring, buffered for spikes, near-exactly-once (idempotency on `event_id`).
  - **Day one: OpenTelemetry-compatible trace endpoint** (tool calls, model, tokens, latency, task outcome mapped into `step_executed`/task events). Cheap now, expensive to retrofit, and it is the differentiator.
  - Payloads validated against `toqarEventSchema` at the edge; rejects logged per tenant, never silently dropped.
- **DoD:** a partner switched from PostHog destination to ours with zero call-site changes; events queryable in ClickHouse within seconds.

### Change 1.4 `analysis-layer` — deterministic numbers

LLMs decide *what* to look at; this layer computes *the numbers*. No
LLM-generated arithmetic in customer-facing numbers, ever.

- **Capabilities:** `semantic-layer`, `analysis-primitives`
- **Key requirements (sketch):**
  - Semantic layer compiled from the registry: every TOQAR headline metric (TSR, Overclaim, CPCT, Loop/Retry, Autonomy Rate, WTA, …) as a generated, parameterized ClickHouse query — definitions in `packages/registry/README.md` are the spec.
  - Statistical primitives as pure, tested functions: anomaly detection (z-score/MAD/IQR), changepoint detection, segmentation drill-down, correlation ranking. **Seed from `new-repo-handoff/quarry/`** (anomaly-detection.ts, MetricsAggregator.ts, funnel/cohort engines) after severing old imports — TDD around each extraction.
  - Every computed result carries the exact query that produced it.
- **DoD:** the weekly report's TOQAR snapshot table fills from one API call; every number reproducible from its attached query.

### Change 1.5 `findings-experience` — the product face

**Entry gate: Design D2 complete** (findings-feed design system in Claude
Design, synced into the repo — see prompts doc).

- **Capabilities:** `analysis-agent`, `findings-feed`, `slack-delivery`, `mcp-server`
- **Key requirements (sketch):**
  - Analysis agent: plans investigations using standard playbooks per TOQAR layer (e.g. "TSR dropped → segment by task_type → correlate with per-tool failure rate → check recent `agent.version`/`model` changes"), calls analysis-layer primitives as tools, writes narrative findings. Every finding shows its queries.
  - Findings feed web app: a feed of agent findings, **not a dashboard grid**. Built from the D2 design system components.
  - Slack delivery of findings (the week-2–5 manual reports, automated).
  - MCP server (real one, TS SDK): customers' own agents (Claude Code, Cursor) query their analytics — metrics, findings, registry.
  - The Phase-0 `question-log.md` verbatim questions are the analysis agent's eval set; ship only when it answers the logged agent-shaped questions correctly.
- **DoD:** a partner reads a finding in the feed, clicks through to its queries, and asks a follow-up through their own agent via MCP.

### Change 1.6 `tenancy-and-security` — cross-cutting track (starts with 1.1)

- **Capabilities:** `tenancy`, `security-controls`
- **Key requirements (sketch):**
  - Multi-tenant isolation at every layer: Postgres RLS, ClickHouse per-tenant scoping, collector auth tokens, agent context separation (we hold customers' source context — this is existential, not compliance theater).
  - SOC 2 track early: audit logging, access controls, encryption at rest/in transit, vendor inventory — controls built alongside features, evidence collected from day one.
- **DoD:** cross-tenant access is impossible by construction and covered by adversarial tests; SOC 2 Type 1 evidence checklist ≥80% green.

**Gate G2:** ≥1 validation partner converted to paying on the platform
(not concierge); events flowing e2e (SDK → ClickHouse → finding → Slack/MCP);
G1 metrics still holding on the platform.

---

## Phase 2 — The closed loop + GA (entry: G2)

> **Specced 2026-07-10; in implementation (amendment 2026-07-10).** Both
> Phase 2 changes have full OpenSpec artifacts in `openspec/changes/` and
> are being built now on founder conviction — G2 is a steering signal,
> not a build gate (see amendment log). Deployment-shaped work (billing
> charges, benchmark cohorts, production deploy) stays operator-gated.
> The sketches below are the at-a-glance summary; the specs are authoritative.

### Change 2.1 `experiment-plane` — the third loop, the moat

- **Capabilities:** `flags-integration`, `sequential-stats`, `experiment-agent`
- **Key requirements (sketch):**
  - Integrate existing flag providers first (PostHog, LaunchDarkly) — no home-grown flags until a customer forces it.
  - **Sequential testing** statistics (agents monitor continuously; fixed-horizon tests break under peeking). `quarry/ab-testing-framework.ts` stats functions are the classical baseline to extend.
  - The loop: hypothesis (from a finding) → variant PR (through the instrumentation agent's PR machinery) → monitor → verdict written to the registry. Autonomy stays a per-customer dial: read-only → instrumentation PRs → experiment PRs.
  - Default guardrails on every experiment: TSR, CPCT, Override Rate.
- **DoD:** one real experiment run end-to-end at a design partner with verdict in their registry.

### Change 2.2 `go-to-market-surface` — what "shipped" needs around the product

- **Capabilities:** `onboarding`, `billing`, `public-docs`, `benchmarking-optin`
- **Key requirements (sketch):**
  - Self-serve onboarding: connect repo → instrumentation agent proposes plan → approve → data flows. Time-to-first-finding is the metric.
  - Billing (usage-tiered; anchor from validation WTP data).
  - Public docs site + the TOQAR content series (one post per layer; the schema spec README is the anchor artifact).
  - Opt-in anonymized cross-tenant benchmarking (the schema was designed for it) — owning the category's benchmark numbers is the long-term moat.
  - **Design D3**: marketing site + experiment/benchmark views (Claude Design, prompts doc).
- **DoD:** a cold signup reaches their first real finding without a human from us in the loop.

**Gate G3 — definition of "fully functional shipped product"** (reviewed
2026-07-10 at go-to-market-surface close-out; ☑ built, ☐ needs
customers/deploy):

- [ ] 3+ paying customers, ≥1 from outside the design-partner cohort — **not met** (no customers yet; the billing + onboarding machinery to acquire them is built)
- [x] All three loops live in code: instruments for you (instrumentation-agent PRs), analyzes for you (analysis-agent → findings feed/Slack/MCP), iterates for you (experiment-agent verdicts to registry)
- [x] Autonomy dial shipped (read-only → instrumentation PRs → experiment PRs per customer; experiment PRs gated at level 2)
- [ ] SLOs: collector 99.9% ingest success; finding latency < 24h — **needs the production deploy** to measure (pipeline proven in the integration job; the deploy is operator-gated, ingestion 5.1)
- [ ] SOC 2 Type 1 report in hand; Type 2 window open — **partial**: controls checklist + evidence discipline built (`docs/security/soc2-controls.md`); the report needs the deploy's encryption/backup evidence and an auditor (G2 decision)
- [x] Docs, onboarding, billing self-serve — public docs (with the cross-reference gate), `toqar onboard`, and usage-tiered billing are built
- [x] CI/CD green across all services; every service has the quality-gates treatment — CI (typecheck, tests, anti-slop, secret scan) + the compose integration job, green across all 15 packages/apps

**Summary:** every G3 item that is *code* is built and green. The three
remaining items (paying customers, deploy-measured SLOs, the SOC 2 report)
require the operator-gated production deploy and real customers — they
cannot be closed by building. The platform is feature-complete against the
roadmap; shipping it is now an operational act, not an engineering one.

---

## Phase 3 — Hardening & competitive depth (entry: founder directive 2026-07-16; **implemented and archived 2026-07-17**, PRs #70–#90)

Grounded in the platform review and the three research reports
(`docs/reviews/2026-07-16-platform-review.md`, `docs/research/`). Three
active OpenSpec changes, implemented **in this order** — trust fixes
before scale, table-stakes before the moat's last mile:

### Change 3.1 `data-plane-hardening` — persistence: efficient, reliable, performant

- **Capabilities:** `analytics-storage` (new), `stream-pipeline` (delta), `tenancy` (delta)
- Query-aligned sort key + typed hot columns (today: UUID-led key, `JSONExtract` on every read), codecs, monthly partitions, incremental MVs for the metrics, bounded-`FINAL` dedup, TTL/tiered storage/per-tenant deletion, replication/backup; idempotent `acks=all` producer, effectively-once sink + DLQ, no acknowledge-then-drop; **engage RLS on the served path** (the review's headline finding — pull this forward).
- **DoD:** same metric numbers, cheaper and replicated; both isolation layers provably active; nothing acked is ever silently lost.

### Change 3.2 `data-governance` — the trust floor for holding source code + traces

- **Capabilities:** `data-governance` (new), `security-controls` (delta)
- Redaction at ingest across all span types (secrets recognizer for code), per-tenant envelope encryption + crypto-shredding, GDPR erasure with an audit trail, residency routing, SOC 2 Confidentiality + Privacy scope. Regional clusters/CMEK/the report itself stay operator/audit-gated.
- **DoD:** a tenant can be provably erased; nothing sensitive lands un-redacted without an explicit opt-in.

### Change 3.3 `agentic-competitive-features` — close the debt, ship the last mile

- **Capabilities:** `eval-framework`, `trace-explorer`, `failure-clustering`, `alerting`, `autonomous-rollout` (new); `otel-traces`, `sdk-node`, `semantic-layer`, `billing` (deltas)
- Sequenced per the market research: evals → agent-native trace explorer (headless-first — open whitespace) → failure clustering → alerting + OTel GenAI import + framework wrappers → outcome-join metrics + per-task pricing → the guardrailed autonomy-level-3 closed loop (canary, blast-radius limits, auto-rollback, kill switch) — the capability no competitor ships.
- **DoD:** TOQAR's own Q/A/R layers are credibly covered, and "it implements" is true within guardrails a tenant declared.

**Steering context (from the market research):** the wedge is open and
citable — nobody joins agent telemetry to business outcomes, nobody
benchmarks cross-tenant, nobody closes the loop; but LangSmith Engine /
Arize Signal / Datadog Patterns now match our analysis half, and
Amplitude's Agent Analytics (beta) is racing our data model. Speed on 3.3
matters; safety framing on autonomy level 3 is non-negotiable.

---

## Design track (Claude Design)

Ready-to-run prompts live in `docs/design/claude-design-prompts.md`.

| ID | When | Scope | Feeds |
| --- | --- | --- | --- |
| **D1** | Now (parallel to validation) | Brand foundation: wordmark direction, palette, type scale, spacing tokens; weekly-report component set | Weekly Slack/email reports; public schema spec page; repo README |
| **D2** | Unlocked (amendment 2026-07-07), **before** change 1.5 | Findings-feed design system: finding cards (anomaly, regression, experiment verdict), evidence/query drill-down, registry browser, autonomy dial, onboarding flow | `findings-feed` web app components |
| **D3** | Phase 2, before 2.2 ships | Marketing site, experiment views, benchmark views | GTM surface |

Workflow per design cycle: run the prompt in Claude Design → review/iterate
there → hand the project output back to this session → we sync it locally
(`DesignSync`/`/design-sync`) into `design/` and consume tokens/components
in the relevant change. Design is gated like code: D2 was originally
gated on G1 ("a polished UI for an unvalidated product is slop with good
kerning") and was unlocked by the 2026-07-07 amendment together with the
Phase 1 build; D3 remains gated on Phase 2.

---

## Standing rules (all phases)

1. Every phase = OpenSpec change(s) with specs before code; archive syncs specs to main.
2. The implement → PR → CI green → merge → pull loop, always; `verify` check required on `main`.
3. Anti-slop gate extends to every new package and service.
4. LLMs plan; deterministic code computes customer-facing numbers.
5. All code changes to customer repos go through PRs; analysis is autonomous.
6. No new package/service/integration until an existing one has tests **and a real consumer**.

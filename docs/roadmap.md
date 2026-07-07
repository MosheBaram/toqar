# Toqar Roadmap — from validation to shipped product

This is the full phase plan from today until Toqar is a fully functional,
shipped product. It is a **plan, not a claim**: nothing below exists until
its phase runs. Each phase becomes one or more OpenSpec changes
(`/opsx:new <change>`) **only when its entry gate opens** — pre-building
gated work is the failure mode this repo was founded against.

Main specs in `openspec/specs/` are the contract for what exists today:
`event-registry`, `tracking-plan`, `instrumentation-skill`,
`validation-ops`, `quality-gates`.

```
 TODAY ──▶ Phase 0.5 ──G1──▶ Phase 1 (6 changes) ──G2──▶ Phase 2 ──G3──▶ SHIPPED
           validation        platform core              closed loop + GA
           + design D1       + design D2                + design D3
```

---

## Phase 0.5 — Run the validation (now, weeks 0–8)

No platform code. The work is operational and lives in `docs/validation/`.

| # | Work | Deliverable |
| --- | --- | --- |
| 0.5.1 | Recruit 5 design partners (agentic startups, pre-seed–Series A, TS stacks, live users, reachable founders) | 5 completed `intake-template.md` docs |
| 0.5.2 | Week-1 instrumentation PR per partner via `instrument-agentic-app` skill | merged PRs (A1 counter) |
| 0.5.3 | Weekly insight reports, weeks 2–5; log every inbound question verbatim | `question-log.md` entries, saved queries |
| 0.5.4 | Skill fixes discovered on real repos | commits + `DRYRUN.md`-style records |
| 0.5.5 | **Design D1** (parallel): brand foundation + report template via Claude Design — see `docs/design/claude-design-prompts.md`, Prompt D1 | Claude Design project `toqar-brand`; tokens adopted by weekly reports |
| 0.5.6 | Week-6 exit interviews: Sean Ellis + WTP number | `scorecard.md` final row |

**Gate G1 (week 6–8, from `docs/validation/scorecard.md`):**

- A1 red (≤2/5 PRs merged) → stop; autopsy; no Phase 1.
- A2 red (≤1/5 partners with ≥2 unprompted questions) → consulting gig, not company; decide before writing any platform code.
- A3 <25% agent-shaped → keep the tech, pivot positioning to "better Mixpanel client"; re-plan Phase 1 scope before starting.
- **G1 green = WTP ≥2 partners at ≥$200/mo AND A1/A2 not red → open Phase 1.**

---

## Phase 1 — Platform core (entry: G1 green)

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

**Gate G3 — definition of "fully functional shipped product":**

- [ ] 3+ paying customers, ≥1 from outside the design-partner cohort
- [ ] All three loops live: instruments for you (PRs), analyzes for you (findings feed/Slack/MCP), iterates for you (experiment verdicts to registry)
- [ ] Autonomy dial shipped (read-only → instr. PRs → experiment PRs per customer)
- [ ] SLOs: collector 99.9% ingest success; finding latency < 24h from anomaly
- [ ] SOC 2 Type 1 report in hand; Type 2 window open
- [ ] Docs, onboarding, billing self-serve
- [ ] CI/CD green across all services; every service has the quality-gates treatment (typecheck, tests, anti-slop)

---

## Design track (Claude Design)

Ready-to-run prompts live in `docs/design/claude-design-prompts.md`.

| ID | When | Scope | Feeds |
| --- | --- | --- | --- |
| **D1** | Now (parallel to validation) | Brand foundation: wordmark direction, palette, type scale, spacing tokens; weekly-report component set | Weekly Slack/email reports; public schema spec page; repo README |
| **D2** | After G1, **before** change 1.5 | Findings-feed design system: finding cards (anomaly, regression, experiment verdict), evidence/query drill-down, registry browser, autonomy dial, onboarding flow | `findings-feed` web app components |
| **D3** | Phase 2, before 2.2 ships | Marketing site, experiment views, benchmark views | GTM surface |

Workflow per design cycle: run the prompt in Claude Design → review/iterate
there → hand the project output back to this session → we sync it locally
(`DesignSync`/`/design-sync`) into `design/` and consume tokens/components
in the relevant change. Design is gated like code: D2 does not start
before G1 opens, because a polished UI for an unvalidated product is slop
with good kerning.

---

## Standing rules (all phases)

1. Every phase = OpenSpec change(s) with specs before code; archive syncs specs to main.
2. The implement → PR → CI green → merge → pull loop, always; `verify` check required on `main`.
3. Anti-slop gate extends to every new package and service.
4. LLMs plan; deterministic code computes customer-facing numbers.
5. All code changes to customer repos go through PRs; analysis is autonomous.
6. No new package/service/integration until an existing one has tests **and a real consumer**.

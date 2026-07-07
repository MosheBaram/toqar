# KICKOFF PROMPT — Toqar, the Agentic Analytics Platform (fresh repo)

> Paste this as the first message to Claude Code in the new repository (or save it as the repo's root spec and reference it). It is the distilled, decision-complete version of the original project brief, plus the lessons from the autopsy of the abandoned `aialytics` repo. The companion implementation plan (`plans/2026-07-07-phase-0-validation-toolkit.md`) contains the exact code for everything in Phase 0 — execute that plan rather than improvising.

---

## Who you are and what you're building

You are bootstrapping an **agentic product-analytics platform** — "Mixpanel for the agentic world," built agent-first. Three loops define the product:

1. **It instruments for you** — an agent reads the customer's codebase, proposes a tracking plan, and implements it via PRs.
2. **It analyzes for you** — agents monitor metrics, detect anomalies, run root-cause investigations, and deliver narrative findings.
3. **It iterates for you** — agents propose experiments, implement variants behind feature flags via PR, monitor results, and write outcomes back into the registry.

**Target customer:** AI-native startups shipping agentic products (AI SDRs, coding agents, support automation). Their analytics needs are agent-shaped — task success, cost per task, tool failures, human takeover — a vocabulary no incumbent owns. **Biggest competitive threat: PostHog** (they suggest; we implement — depth on the closed loop is the defense).

## History you must know

A previous attempt lives at `~/Projects/moshe-private/aialytics` (parked, read-only). It was a ~410k-line AI-bulk-generated "Claude Code enterprise orchestration platform" — wrong product, and worse, hollow: 118 files faked data with `Math.random`, the MCP server was a comment-admitted fake, storage was JSON-on-disk, docs claimed features that didn't exist. It was abandoned after assessment on 2026-07-07. A few genuinely good pure-logic files were extracted into `quarry/` in this handoff folder (see `quarry/README.md`) — use them as seeds for the analysis layer later; everything else from that repo is dead.

## Non-negotiable design principles

1. **The human-in-the-loop boundary is the product.** All code changes go through PRs; all analysis/dashboards are autonomous. Autonomy is a per-customer dial, sequenced: read-only analysis → instrumentation PRs → experiment PRs.
2. **LLMs decide *what* to look at; deterministic code computes *the numbers*.** Agents plan investigations and call statistical primitives as tools. Every finding shows its queries. **No LLM-generated arithmetic in customer-facing numbers, ever.**
3. **The schema registry is the shared contract.** Versioned, typed, stored as code in the customer's repo (JSON/TS definitions), synced to backend. Every event carries its journey and its *reason for existing* (the metric/hypothesis it serves). All agents read and write through it.
4. **Agent-native interfaces are first-class.** MCP server so customers' own agents (Claude Code, Cursor) can query their analytics. The web app is a feed of agent findings, not a dashboard grid. Slack delivery for findings.
5. **The moat is accumulated context** — the agent's understanding of each customer's codebase, taxonomy, and experiment history. Design everything (especially experiment outcomes) to compound in the registry.

## Anti-slop rules (learned from the autopsy — hard constraints)

- **No fake data in product code.** `Math.random`, hardcoded metric values, and "mock for now" implementations are forbidden outside test files and clearly-marked seed scripts. A metric either computes from real data or does not exist.
- **No aspirational documentation.** README and docs may only claim what is implemented and verified. No badge walls, no "enterprise-grade," no feature lists for unbuilt features.
- **Depth before breadth.** No new package, service, or integration until an existing one has tests and a real consumer. The old repo died of breadth.
- **Small, verified commits.** Every commit typechecks and passes tests. TDD for all logic code.
- **Validation gates platform code.** Do not build ingestion, dashboards, or services until the concierge validation (below) reads green. Phase 0 is deliberately thin.

## Phase gating

**Phase 0 (now): the validation toolkit.** An 8-week concierge test with 5 design partners (agentic startups, pre-seed–Series A, TS stacks, live users, reachable founders) decides whether this is a company. Build only what the test needs:

1. Monorepo scaffold (TypeScript, pnpm workspaces, vitest; strict TS everywhere).
2. `packages/registry` — the TOQAR event schema as typed Zod definitions (~10 core events, full property specs), registry-entry and tracking-plan-diff types, and a tracking-plan markdown renderer.
3. **The concierge instrumentation skill** (`skills/instrument-agentic-app/`) — a Claude Code skill that, given a partner's repo, produces a tracking plan in registry-diff format and then an instrumentation PR. Quality bar: **PR mergeable with ≤ minor edits.** This is v0 of the product and the week-1 deliverable. It is the single highest-priority artifact.
4. Public schema-spec README (doubles as the category-creation content artifact).
5. Validation ops kit: intake template, weekly Slack report template, verbatim question log, kill-criteria scorecard.

Validation mechanics: Week 0 intake captures each partner's "3 unanswerable questions" verbatim. Week 1: instrumentation PR into their repo; data lands in *their* PostHog free tier or a hosted ClickHouse — **build no ingestion**. Weeks 2–5: weekly insight reports via Slack; no scheduled calls — measure *inbound* questions, logged verbatim and classified (agent-shaped vs. classic). Week 6: exit interview — Sean Ellis test + a concrete willingness-to-pay number.

**Kill criteria (write these on the wall):**
- A1 red: ≤2/5 instrumentation PRs merged.
- A2 red: ≤1/5 partners ask ≥2 unprompted questions by week 4. (A2 decides company vs. consulting gig.)
- A3: <25% of questions agent-shaped → pivot positioning to "better Mixpanel client."
- WTP green: ≥2 partners name ≥$200/mo.

**Phase 1 (only after validation green), in order:**
1. Schema registry backend + registry-as-code sync + TOQAR default taxonomy.
2. Instrumentation agent productized from the concierge skill (scope: TypeScript/React frontend + one Node backend framework — depth over breadth).
3. Ingestion plane: lightweight SDKs → Fastify HTTP collector → Redpanda → ClickHouse. Boring and proven; buffering for spikes; near-exactly-once. **Day one: an OpenTelemetry-compatible endpoint for agent traces** (tool calls, model, tokens, latency, task outcome) — cheap now, expensive to retrofit, and it's the differentiator.
4. Deterministic analysis layer: semantic layer compiled from the registry + statistical primitives (anomaly detection, changepoint detection, segmentation drill-down, correlation ranking). Seed from `quarry/`.
5. Analysis agent + findings feed + Slack delivery + MCP server (real one, TS SDK). Standard playbooks per TOQAR layer (e.g. "TSR dropped → segment by task type → correlate with tool failure rate → check recent prompt/model changes").
6. Experiment plane: integrate existing flags (PostHog/LaunchDarkly) first; **sequential testing** stats (agents monitor continuously — fixed-horizon tests break under peeking); hypothesis→variant-PR→monitor→verdict-to-registry loop. Default guardrails on every experiment: TSR, CPCT, Override Rate.

Cross-cutting from the start of Phase 1: multi-tenant isolation; SOC 2 track early (we hold customers' source context). Stack: TypeScript throughout, Fastify, ClickHouse, Redpanda, Postgres control plane, Anthropic API for agents.

## TOQAR — the metrics framework (the product's vocabulary)

**Primitives:** Task (unit of value) → Run → Step; Handoff (agent↔human); Session (human-side bridge).

**The ~10 core events** (full typed property specs live in `packages/registry` per the Phase 0 plan):
`task_started`, `task_completed`, `task_failed`, `task_abandoned`, `step_executed` (tool, model, tokens, latency, error), `handoff_to_human`, `human_approved`, `human_edited`, `human_overrode`, `feedback_given`.

**Layers and headline metrics:**
- **T — Task Success:** Task Success Rate by task type; Verified vs. self-reported success (**Overclaim Rate**); First-Run Resolution; Abandonment.
- **O — Operational Efficiency:** Cost per Completed Task (failed runs count in the numerator); tokens/steps per task trends; latency; Loop/Retry Ratio; per-tool failure rate.
- **Q — Quality & Drift:** Human Edit Distance; Regression Delta around any prompt/model/tool change (every change is an implicit experiment); eval-score vs. production gap; complaint rate.
- **A — Autonomy & Trust:** Autonomy Rate (zero-intervention tasks — the agent-PMF indicator); Escalation Rate; Override/Takeover Rate; Approval Friction; Blast-Radius Delegated (expansion metric).
- **R — Retention & Expansion:** Weekly Task Actors (replaces DAU); Task Depth Expansion (distinct task types per account); Delegation Share; Net Task Growth.

Design the schema for opt-in anonymized cross-tenant benchmarking — owning the category's benchmark numbers is a long-term moat. The framework doubles as content strategy: one post per layer + the public schema spec on GitHub.

## What to do first

1. Execute `plans/2026-07-07-phase-0-validation-toolkit.md` task by task (it contains complete code and commands — scaffold, registry package, skill, docs, validation kit).
2. When the skill exists, dry-run it against the plan's fixture app, then against the first design partner's repo.
3. Do not start Phase 1. Do not add packages beyond the plan. When tempted to build platform, recruit a design partner instead.

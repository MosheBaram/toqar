# Claude Design prompts

Paste-ready prompts for claude.ai/design, one per design cycle in
`docs/roadmap.md`'s design track. Run **D1 now**; D2 unlocked by the
2026-07-07 roadmap amendment; D3 in Phase 2. After each cycle, hand the resulting project back to the
Claude Code session — it gets synced locally via `/design-sync` into
`design/` and consumed by the relevant OpenSpec change.

---

## Prompt D1 — brand foundation + report components (run now)

Create a design-system project named `toqar-brand`, then paste:

```
You are designing the brand foundation for Toqar — product analytics for
agentic products ("Mixpanel for the agentic world").

CONTEXT
- Toqar measures AI agents doing real work: task success, cost per task,
  tool failures, human takeovers. Its framework is TOQAR: Task success,
  Operational efficiency, Quality & drift, Autonomy & trust, Retention.
- Audience: founders and engineers at AI-native startups (AI SDRs, coding
  agents, support automation). They live in terminals, Slack, and GitHub.
- Brand personality: precise, evidence-first, calm. Every number in the
  product traces to a query — the design should feel like that: nothing
  decorative that can't justify itself. Think instrument, not billboard.
- Anti-goals: generic AI gradients, sparkles/robot clichés, dashboard-
  vendor blue, enterprise beige, dark-mode-only edginess.

DELIVERABLES (as separate components/cards, grouped as noted)
1. Wordmark direction — group "Brand": 3 distinct typographic directions
   for "Toqar" (plus a small "TOQAR" framework lockup variant of each).
   No pictorial logo yet.
2. Color system — group "Colors": neutral ramp + one primary + semantic
   colors keyed to product concepts: success/verified, failed, abandoned,
   handoff/human-touch, agent-autonomous. Must work in light AND dark;
   WCAG AA on text; include the five TOQAR layer accent colors (T/O/Q/A/R)
   distinguishable in a table legend.
3. Type system — group "Type": UI font + monospace pairing (numbers,
   queries, and event names like `task_completed` render in mono
   constantly — the mono must carry data-density gracefully). Scale from
   caption to page title.
4. Spacing & radius tokens — group "Spacing": a compact scale suited to
   data-dense surfaces.
5. Weekly insight report — group "Report": a styled one-page report
   template with: header (partner name, week), a "headline finding"
   block, a 5-row TOQAR metrics table (metric, this week, last week,
   delta with directional color), a "finding of the week" narrative
   block with a linked-query footnote style, and a "question you can now
   answer" callout. Both a Slack-message-friendly compact variant and an
   email/PDF variant.
6. Table & badge primitives — group "Components": the metrics table
   style, delta badges (up-good vs up-bad aware), status badges for
   verified / self_reported / failed / abandoned, and an event-name chip
   (mono, e.g. `step_executed`).

CONSTRAINTS
- Self-contained HTML/CSS per component; light and dark theme for every
  card; system-ui fallbacks declared.
- Real content in examples, no lorem ipsum: use an AI-SDR example
  ("reply_to_lead", TSR 62%, cost per completed task $0.42).
- Design tokens exported as CSS custom properties in a dedicated
  tokens card so engineering can consume them verbatim.
```

**Definition of done for D1:** you can produce next week's partner report
using the Report components, and the repo README/schema-spec page can
adopt the tokens.

---

## Prompt D2 — findings-feed design system (unlocked 2026-07-07)

Create/extend project `toqar-product`, then paste:

```
You are designing the product surface for Toqar, extending the
`toqar-brand` foundation (reuse its tokens: colors, type, spacing).

THE PRODUCT SHAPE
Toqar's web app is a FEED OF AGENT FINDINGS, not a dashboard grid. An
analysis agent investigates the customer's agent metrics and posts
narrative findings; every number links to the exact query that produced
it. Users are engineers; trust is earned by showing work.

DELIVERABLES (grouped as noted)
1. Finding card — group "Feed": the core unit. Variants: anomaly
   detected, metric regression (before/after an agent.version change),
   experiment verdict, weekly digest. Anatomy: severity + TOQAR-layer
   accent, headline sentence, sparkline or delta chip, agent-narrative
   summary (2–3 sentences), "show the work" affordance, timestamp,
   task_type/segment chips.
2. Evidence drill-down — group "Feed": the expanded finding: the
   investigation chain (step-by-step what the agent checked), each step
   with its query (mono block, copyable) and result table/mini-chart.
3. Feed page layout — group "Pages": findings stream with filters by
   TOQAR layer, task_type, severity; empty state for a fresh tenant
   (honest: "no findings yet — data landed 2h ago, first sweep at 6h").
4. Registry browser — group "Pages": the event registry as the shared
   contract: per-event card showing description, journey, owner_metric,
   hypothesis, status (proposed/active/deprecated), since_version, and
   its emission code_locations.
5. Autonomy dial — group "Components": the per-customer control
   sequencing read-only analysis → instrumentation PRs → experiment PRs.
   Must read as a deliberate, auditable permission ladder, not a fun
   slider.
6. Onboarding flow — group "Pages": connect repo → agent proposes
   tracking plan (diff view: added events table) → approve → "data
   flowing" confirmation. The tracking-plan review screen is the product's
   first impression — it renders the same markdown structure as the
   tracking-plan format (summary, three-questions mapping, event table,
   per-event detail).
7. Slack finding message — group "Feed": the finding card translated to
   Slack Block Kit constraints.

CONSTRAINTS
- Same as D1 (self-contained, light+dark, AA, real example content:
  an AI-SDR tenant, TSR drop from 71%→62% traced to crm_lookup timeouts
  after an agent version bump).
- Information density over whitespace theater; mono for all identifiers.
```

**Definition of done for D2:** change 1.5 (`findings-experience`) builds
its components from these cards without inventing new patterns.

---

## Prompt D3 — marketing + experiment/benchmark views (unlocked 2026-07-10)

Extend the existing `Toqar Design System` project (reuse `toqar-brand`
tokens and D2 product components), then paste:

```
You are designing the Phase 2 surfaces for Toqar, extending the existing
design system (tokens from toqar-brand; product components from D2).

CONTEXT
Toqar now closes all three loops: it instruments for you (PRs), analyzes
for you (findings feed), and iterates for you (experiments → verdicts).
These surfaces sell that and show the experiment/benchmark data.

DELIVERABLES (grouped as noted)
1. Marketing site — group "Marketing": hero + sections for a static
   landing page. Positioning: "your analytics team, agentic." One section
   per product loop (instrument / analyze / iterate). A pricing section
   with two tiers (Starter $200/mo, Growth $800/mo) driven by usage
   limits. Voice per the brand readme — instrument, not billboard; no
   hype, numbers are the nouns. Light + dark.
2. Experiment monitor — group "Experiments": the view of a running
   experiment. A sequential-testing chart (effect estimate with an
   always-valid confidence sequence that narrows over time, a zero line,
   the ship/revert boundaries), the current decision chip
   (inconclusive / ship / revert), per-arm sample counts, and a guardrail
   status row (TSR, Cost per Completed Task, Override Rate — each ok or
   breached). Real example: crm_retry variant, +6.1 pts, ship.
3. Experiment verdict card — group "Experiments": the concluded result as
   a FindingCard 'experiment' variant (reuse the D2 shape) with the effect,
   confidence interval, and guardrail outcomes, every number citing a
   query id.
4. Benchmark comparison — group "Benchmark": the opt-in cohort view. Show
   a distribution as an aggregate band (mean ± stddev — NEVER individual
   points, min, or max: those are other tenants' raw values) with the
   viewer's own position marked as a percentile. An "insufficient cohort"
   empty state for below-k cohorts. An opt-in/opt-out control that reads
   as a deliberate, reversible data-sharing choice.

CONSTRAINTS
- Same as D1/D2 (self-contained, light+dark, WCAG AA, real example content,
  mono for identifiers and numbers).
- Privacy is load-bearing on the benchmark view: the design must make it
  impossible to read an individual tenant's value — aggregate bands only,
  no scatter of raw points.
```

**Definition of done for D3:** the marketing landing page and the
experiment/benchmark views can be built from these cards. After the run,
hand the project back to the Claude Code session to sync into
`skills/toqar-design` and wire the views (change 2.2 tasks 5.1–5.2).

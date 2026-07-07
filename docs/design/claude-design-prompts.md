# Claude Design prompts

Paste-ready prompts for claude.ai/design, one per design cycle in
`docs/roadmap.md`'s design track. Run **D1 now**; D2 only after gate G1;
D3 in Phase 2. After each cycle, hand the resulting project back to the
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

## Prompt D2 — findings-feed design system (run only after gate G1)

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

## Prompt D3 — marketing + experiment/benchmark views (Phase 2)

Not written yet — draft it when 2.2 is specced, extending `toqar-brand`.
Scope: marketing site (positioning: "your analytics team, agentic"),
experiment monitor views (sequential-testing confidence over time,
guardrail status for TSR/CPCT/Override Rate), opt-in benchmark
comparison views. Writing it now would speculate past two gates.

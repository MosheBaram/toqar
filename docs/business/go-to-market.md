# Toqar — Business & Go-to-Market Plan

The plan of record for how Toqar becomes a business. Grounded in
`docs/research/2026-07-17-gtm-research.md` (cited GTM research, July 2026),
`docs/research/2026-07-16-market-landscape.md` (14-competitor analysis), and
the validation kit (`docs/validation/`). Like the roadmap: **a plan, not a
claim** — current revenue is $0, customers are 0, and the validation
scorecard is empty. Recommendations that change code or licensing are
marked **[founder decision]**.

## 1. Thesis

Product analytics for agentic products, built agent-first. Three loops:
it instruments for you (PRs), it analyzes for you (cited findings), it
iterates for you (experiments through guardrailed autonomous rollout).
The product is feature-complete through Phase 3; what remains is
operational: deploy, customers, revenue.

## 2. ICP

AI-native startups shipping agentic products — AI SDRs, coding agents,
support automation. Seed to Series A (see risk §10.3 on pre-seed
mortality), TypeScript stacks, live users, reachable founders. The buyer
is a founder/founding engineer who self-serves, evaluates by reading docs
and code, and increasingly *codes with agents* (which is itself a channel,
§7). Disproportionately YC-adjacent.

## 3. Positioning & the wedge

**"Mixpanel for the agentic world" — the analytics layer that joins agent
telemetry to business outcomes, with numbers you can cite.**

The citable competitive facts (market research, verified):

- **Nobody joins agent telemetry to product/business outcomes.** Langfuse
  ships an *outbound Mixpanel integration* because retention questions are
  out of its scope. Toqar's `quality_cohort_retention` does the join in
  one cited query.
- **Nobody does cross-tenant benchmarking.** Toqar's k-anonymized
  benchmarks are unique and compound with every tenant — a data network
  effect PostHog cannot copy without our consent model.
- **Nobody closes the loop.** PostHog: "nothing reaches production on its
  own." LangSmith Engine and Arize Signal stop at a draft PR. Toqar's
  autonomy level 3 promotes a winning variant inside tenant-declared
  guardrails — with a stronger safety story (canary, blast radius,
  auto-rollback, kill switch) than the human gate it replaces.
- **The mid-market shelf keeps orphaning customers**: June dead (Aug 2025),
  Statsig split between OpenAI (team) and Amplitude (brand/customers),
  Langfuse absorbed by ClickHouse, Helicone reportedly frozen (unverified).
  The trust wound is real; we answer it with a **data-portability
  guarantee** (open export, documented offboarding) as a stated product
  commitment.

Named threats: **PostHog** (volume PLG, "10x cheaper" LLM analytics — never
fight it on price-per-event) and **Amplitude Agent Analytics** (explicitly
building agent→business-outcome analytics; still closed beta as of
mid-2026; now owns Statsig's experimentation and June's SMB UX). The
window is real and closing — speed matters.

## 4. Honest starting state

The Phase 0.5 validation never ran: 0/5 design partners recruited, no WTP
rows, the $200/$800 tiers were seeded from the validation *framework*, not
its results. The concierge machinery (instrumentation skill, intake
templates, kill criteria) is built and waiting. **GTM step one is running
it — restructured as a paid design-partner program (§6), not a free
concierge.** The kill criteria stand: A1 (PRs merged), A2 (unprompted
questions), A3 (agent-shaped share), WTP ≥2 partners at ≥$200/mo.

## 5. GTM motion

**Bottom-up PLG with founder-led sales assist, value-anchored — not
volume PLG, not sales-led.**

- At $2.4–9.6k ACV a sales cycle is unaffordable and the ICP buys
  self-serve (dev tools: ~50% self-serve share, the highest of any
  category). But PostHog *is* the volume-PLG moat — unwinnable for a solo
  founder.
- The winnable shape is **Braintrust's, at a lower price**: anchor on
  decision value (outcome metrics, evals, autonomous optimization), seed
  with paid design partners, self-serve onboarding with the founder
  personally on every ICP signup ("instrument your agent live" 20-min
  call, not a demo).
- The two structural differentiators are **content weapons**: the TOQAR
  framework is the category-defining essay (North Star / MELT / DORA
  precedent — frameworks with benchmark numbers spread; opinions don't),
  and the benchmark data feeds a quarterly "State of Agentic Products"
  report — the repeatable PR engine.

## 6. Design partners → founding customers (the Sierra/BVP playbook)

Restructure the 5-partner concierge into a paid program:

1. **Partners pay from day one** (discounted is fine; free is not) —
   payment is the honest WTP signal (Bessemer; Sierra converted 6/6 paid
   partners).
2. Hard timebox with the **conversion event pre-negotiated**: at public
   launch, partners convert to founding-customer terms (e.g. 40–50% off
   year one, locked, in exchange for logo + case study + quote).
3. Weekly cadence, kill criteria live on the scorecard as designed.
4. Target: **≥3 of 5 convert**; 2 case studies with hard numbers ("cut
   cost per completed task 31%") ready for launch week.
5. Cold-recruited partners > friendly intros (honest signal).

## 7. Channels (priority order, solo-founder budget)

| # | Channel | Why | Effort |
|---|---------|-----|--------|
| 1 | Design partners → founding customers | Only proven revenue path | ~1 day/wk ongoing |
| 2 | TOQAR framework essay + quarterly benchmark report | Category ownership; compounding | 2–3 wks, then quarterly |
| 3 | Show HN launch (PH as trailer 2–3 days later) | Highest single-day dev reach; needs self-serve + free tier | ~1 wk prep |
| 4 | X/Twitter build-in-public | ICP lives there; feeds everything | 30–60 min/day |
| 5 | MCP registries (official, mcp.so, Smithery, Glama, LobeHub) | Near-zero cost, durable; server already exists | 1–2 days once |
| 6 | Agent-legible docs (llms.txt, one-command install) | "Agent-led growth" — be what Claude Code/Cursor pick (Resend precedent) | 3–5 days |
| 7 | YC ecosystem (Bookface via partners, batch outreach) | First-40-customers pattern; ICP-dense | 2–3 days + ongoing |
| 8 | Latent Space Discord + AI Engineer presence | Where agent/eval vocabulary gets coined; socialize TOQAR there first | 2–3 hrs/wk |
| 9 | Honest comparison pages (vs PostHog/Langfuse/Braintrust) | PostHog's own best format, aimed back | 1 wk |
| 10 | AI newsletters (Ben's Bites, Rundown, etc.) | Spiky; pitch at launch/report moments | hours per pitch |

Deliberately front-loaded one-time work (registries, docs, launch);
recurring load is capped at partners + content + X.

## 8. Pricing & packaging

**Stand:** $200 Starter / $800 Growth. Consistent with the WTP threshold,
positioned between Langfuse ($29–199) and Braintrust ($249+), and priced
on decision value, not telemetry volume. Gate **Growth on capability**
(guardrailed rollout, experiments, alerting depth, benchmark *viewing*),
not on volume — volume-gating is PostHog's war.

**Recommended amendments [founder decision — changes billing code]:**

1. **Add a free Developer tier** (~50k observations or ~10k completed
   tasks/mo, 1 project). Every credible competitor has one; the Show HN /
   self-serve motion is impossible without it. Size it so a production
   agent outgrows it in weeks.
2. **Benchmarking as the Growth carrot**: contribute on any tier, *see*
   cohort comparisons on paid tiers — monetizes the network effect.
3. **Per-completed-task pricing stays a published secondary option**, not
   the default. The outcome-pricing wave is real (Intercom $0.99, Zendesk
   $1.50–2.00, HubSpot $0.50 per resolution) and Toqar metering the same
   unit its customers monetize is a genuinely novel alignment story — but
   only ~5–10% of AI companies price on outcomes as primary today, and
   attribution disputes must never gate revenue. Hybrid base+overage
   matches the market trend (43%→61% hybrid by end-2026).
4. **No enterprise tier yet.** Publish a "Contact us" row (SSO/SAML, audit
   logs, retention controls, DPA/SOC 2) — the exact Langfuse commercial
   set, much of which we've already built — and productize on first pull.

## 9. Open-source strategy [founder decision — licensing]

**Open the standard, the SDK, and the MCP server. Keep the engine
commercial.**

- **Open (MIT):** the TOQAR spec (schema + metric definitions — if PostHog
  adopts our schema, we win the framing war), the TypeScript SDK +
  wrappers (npm adoption surface; the `react-email` lesson), the MCP
  server (registries require public inspection).
- **Closed:** the analytics engine, citation pipeline, eval runtime,
  autonomous rollout, alerting, and above all **benchmarking** —
  structurally impossible to self-host; the cleanest moat.
- **Not full open-core**: a solo founder cannot service self-hosters, and
  Langfuse's 2025 move (open-sourcing formerly-commercial features)
  shows that bar only rises. Spec+SDK captures most of the distribution
  at ~10% of the maintenance.

## 10. 90-day launch sequence

**Days 1–30 — convert the concierge, build the artillery**: restructure
partners to paid (§6); write + socialize the TOQAR framework essay (drafts
in Latent Space first); list the MCP server everywhere; agent-legible
docs; benchmark waitlist. *Blocker to clear: the production deploy
(operator-gated) — self-serve requires a live service.*

**Days 31–60 — launch cluster**: self-serve signup + free tier live; Show
HN (Tue–Thu am ET, live demo, maker comment with one honest limitation,
camp the thread); PH + X thread series + newsletter pitches same week; two
partner case studies published; founder emails every ICP signup within 24h.

**Days 61–90 — flywheel**: first "State of Agentic Products" benchmark
report (n stated honestly, even if small); comparison pages; YC outreach;
convert remaining partners on the pre-set date; announce founding-customer
cohort 2 with limited slots.

**90-day gate (measured, not vibes):** ≥3/5 partners converted;
signup→activated (instrumented + first metric) tracked; activated→paid
≥3–5%; framework essay generated ≥1 substantive HN/Latent Space
discussion. Miss the gate → rerun the kill-criteria decision rules
(`docs/validation/scorecard.md`) before spending further.

## 11. Revenue model

- **Engine:** free tier → product-qualified signups → $200 Starter →
  $800 Growth (capability-gated) → enterprise on pull.
- **Year-one shape** (plan, not forecast): 3–5 founding customers from
  partners (~$7–15k ARR at founding discount) + self-serve ramp post-launch.
  At $200–800 ACV the business needs *hundreds* of logos or an enterprise
  tier to matter — the wedge is land-now/expand-with-the-category.
- **Unit economics guardrail:** ICP churn-by-death is the structural risk;
  measure logo churn from month one, bias acquisition toward revenue-bearing
  agents (seed+), and let per-task pricing scale with survivors.

## 12. Risks

1. **Amplitude Agent Analytics GA** (threat #1a): same thesis, more
   distribution. Mitigations: ship the benchmark network effect first;
   closed-loop autonomy they won't match (they will not open PRs in
   customer repos); startup-native positioning and price.
2. **PostHog bundling/price war**: never compete per-event; compete on
   cited outcomes + the loop.
3. **ICP mortality**: pre-seed logos die; land seed+.
4. **Consolidation fear** ("another June"): data-portability guarantee,
   published offboarding.
5. **Framework doesn't land**: survivorship bias is real; DORA had
   institutional weight. Mitigation: numbers (benchmarks) travel where
   opinions don't; co-publish with partners.
6. **Solo-founder overreach**: the channel list is 3 FTEs if run naively;
   the sequence caps recurring load deliberately.
7. **Unverified inputs** (flagged, do not repeat externally without
   verification): Helicone/Mintlify acquisition; MCP-registry install
   shares; dark-social discovery percentages; newsletter traffic claims.

## 13. Decision queue for the founder

| # | Decision | Recommendation | Unblocks |
|---|----------|----------------|----------|
| 1 | Production deploy (operator-gated since G3) | Do first — everything else assumes a live service | Self-serve, launch, partners |
| 2 | Free Developer tier | **Implemented 2026-07-17** (50k events / 10k tasks / 500 runs; new tenants default to free) | Show HN, self-serve motion |
| 3 | Open-source spec + SDK + MCP server | Yes (§9) — licensing + repo split | Registries, npm channel, framing war |
| 4 | Design-partner recruiting (5 paid slots) | Start now with §6 terms | Revenue, case studies, benchmarks |
| 5 | Benchmark gating (view on paid) | Yes (§8.2) — small product change | Growth-tier pull |

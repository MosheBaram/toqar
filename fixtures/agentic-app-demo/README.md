# agentic-app-demo — FIXTURE

A deliberately minimal fake agentic product (an AI SDR that drafts
replies to inbound leads) used to dry-run the `instrument-agentic-app`
skill before it touches a real design-partner repo.

**This is a test fixture, not product code.** It is excluded from the
pnpm workspace, CI typecheck, and the anti-slop gate. It exists to
exercise the skill's seam-mapping:

- an agent loop entry point (`replyToLead`)
- one LLM call (`anthropic.messages.create`)
- one tool call (`fetchLead` → CRM)
- a human-approval seam (`requestApproval`), including edit/override paths
- success / failure / abandonment outcomes
- **planted PII bait** (lead emails, personal notes, message bodies) that
  a correct tracking plan must never capture — only `*_ref` pointers.

Dry-run acceptance: the skill produces `analytics/tracking-plan.md` here,
validates against `trackingPlanSchema`, anchors real `file:line` seams,
and stops without writing any instrumentation code.

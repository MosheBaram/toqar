# Tracking Plan — fixtures/agentic-app-demo
Generated: 2026-07-07T13:30:00.000Z
Wire 9 of the 10 TOQAR core events into the reply_to_lead loop (feedback_given is excluded: the fixture has no user-feedback seam, and an event with no real emission site does not ship). Makes the three intake questions answerable: autonomy rate, cost per sent reply, and reviewer edit magnitude.
## Added events

| Event | Journey | Owner metric | Status |
| --- | --- | --- | --- |
| `task_started` | lead_outreach | task_success_rate | proposed |
| `step_executed` | lead_outreach | per_tool_failure_rate | proposed |
| `task_completed` | lead_outreach | task_success_rate | proposed |
| `task_failed` | lead_outreach | task_success_rate | proposed |
| `task_abandoned` | lead_outreach | abandonment_rate | proposed |
| `handoff_to_human` | lead_outreach | autonomy_rate | proposed |
| `human_approved` | lead_outreach | approval_friction | proposed |
| `human_edited` | lead_outreach | human_edit_distance | proposed |
| `human_overrode` | lead_outreach | override_rate | proposed |

### `task_started`

A reply_to_lead task begins when the agent picks up a lead.
- Hypothesis: Baseline volume denominator for all three intake questions.
- Owner metric: task_success_rate
- Code locations: `src/agent.ts:13`
- Implementation: Emit at the top of replyToLead; task_id from leadId, run_id generated per invocation; lead content only as input_ref (lead id), never the lead fields.

### `step_executed`

Each step of the run: CRM lookup (tool_call), draft generation (llm_call), email send (tool_call).
- Hypothesis: Cost per sent reply (Q2) needs tokens/latency per llm_call; tool failures explain failed tasks.
- Owner metric: per_tool_failure_rate
- Code locations: `src/agent.ts:15`, `src/agent.ts:17`, `src/agent.ts:35`
- Implementation: tool_name crm_lookup / email_send; model and token usage from the messages.create response; status error on thrown exceptions.

### `task_completed`

Reply sent. Provider ack (messageId) upgrades verification to verified.
- Hypothesis: Q2 cost per sent reply: cost_usd summed across the run divided by completions.
- Owner metric: task_success_rate
- Code locations: `src/agent.ts:36`
- Implementation: verification=verified, verifier=email_provider_ack; duration from startedAt; output only as output_ref (messageId).

### `task_failed`

Empty draft or a thrown error (CRM miss, API failure) fails the task.
- Hypothesis: Failure share and error taxonomy for the success-rate denominator.
- Owner metric: task_success_rate
- Code locations: `src/agent.ts:30`, `src/agent.ts:39`
- Implementation: error.type from the caught error class (e.g. crm_lookup_failed, empty_draft); retryable=true for transient API errors.

### `task_abandoned`

Reviewer declines the draft; the task is walked away from.
- Hypothesis: Distinguishes reviewer rejection from technical failure in the denominator.
- Owner metric: abandonment_rate
- Code locations: `src/agent.ts:33`
- Implementation: abandoned_by=human, reason=approval_declined.

### `handoff_to_human`

Draft goes to the reviewer for approval before sending.
- Hypothesis: Q1: share of replies sent with zero human touch — this event is the numerator's complement.
- Owner metric: autonomy_rate
- Code locations: `src/agent.ts:32`
- Implementation: reason=approval_required, blocking=true; draft travels as context_ref, never inline.

### `human_approved`

Reviewer approves the draft.
- Hypothesis: response_latency_ms distribution shows where review is the bottleneck.
- Owner metric: approval_friction
- Code locations: `src/approval.ts:16`
- Implementation: response_latency_ms from respondedInMs; emit in the approval callback.

### `human_edited`

Reviewer changed the draft before approving (edited=true, finalText differs).
- Hypothesis: Q3: how often and how much the reviewer rewrites drafts.
- Owner metric: human_edit_distance
- Code locations: `src/approval.ts:16`
- Implementation: artifact_type=email_draft; edit_magnitude in chars = diff(draft, finalText); texts themselves never captured.

### `human_overrode`

Reviewer discards the agent draft entirely and writes their own (approved=false path when they take over).
- Hypothesis: Trust indicator: overrides falling over time is the PMF signal.
- Owner metric: override_rate
- Code locations: `src/agent.ts:33`
- Implementation: Emit alongside task_abandoned when the reviewer replaces rather than declines; reason free-text enum from the approval UI.


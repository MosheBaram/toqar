# TOQAR — an open event schema for agentic products

Classic product analytics counts page views and clicks. Agentic products
do work: they take on tasks, execute steps, hand off to humans, and get
overruled. TOQAR is a typed event schema for measuring that — ten core
events and five metric layers. This package is the reference
implementation (TypeScript + Zod).

## Primitives

- **Task** — the unit of value ("reply to this lead"). Has an outcome.
- **Run** — one attempt at a task. Retries create new runs, same task.
- **Step** — one action inside a run: an LLM call, a tool call, a retrieval.
- **Handoff** — control passing between agent and human.
- **Session** — the human-side bridge to classic web analytics.

## The ten core events

| Event | When | Key properties |
| --- | --- | --- |
| `task_started` | A task begins | `initiator`, `parent_task_id?`, `input_ref?` |
| `task_completed` | Task ends in claimed success | `verification` (verified \| self_reported), `verifier?`, `duration_ms`, `steps_total`, `tokens_*_total?`, `cost_usd?` |
| `task_failed` | Task ends in failure | `error.type`, `retryable`, `failed_step_id?`, `duration_ms` |
| `task_abandoned` | Task walked away from | `abandoned_by` (human \| timeout \| system), `duration_ms` |
| `step_executed` | Every step, success or not | `step_type`, `tool_name?`, `model?`, `tokens_in/out?`, `latency_ms`, `status`, `error?`, `retry_of_step_id?` |
| `handoff_to_human` | Agent asks a human | `reason`, `blocking`, `handoff_id` |
| `human_approved` | Human approves a handoff | `handoff_id`, `response_latency_ms` |
| `human_edited` | Human changes agent output | `artifact_type`, `edit_magnitude?` (chars \| tokens \| lines) |
| `human_overrode` | Human takes over / discards | `takeover_step_id?`, `reason?` |
| `feedback_given` | Explicit satisfaction signal | `rating` (binary \| scale), `source` |

Every event shares a common envelope: `event_id`, `schema_version`,
`timestamp`, `task_id`, `run_id`, `task_type`, `agent { name, version?,
model? }`, `session_id?`. Full property specs with validation rules are
in `src/events.ts`. Privacy rule: no raw user content in properties —
large or sensitive payloads travel as `*_ref` pointers into your own
storage.

## The five layers and how metrics derive from events

**T — Task Success**
- Task Success Rate (by `task_type`): `task_completed` / (`task_completed` + `task_failed` + `task_abandoned`).
- Overclaim Rate: share of `task_completed` with `verification = self_reported` that later attract `human_edited`, `human_overrode`, or negative `feedback_given` — the gap between what the agent claims and what holds up.
- First-Run Resolution: tasks whose success came on `run_id` #1.
- Abandonment: `task_abandoned` share, segmented by `abandoned_by`.

**O — Operational Efficiency**
- Cost per Completed Task: sum of `cost_usd` across **all** runs (failed included) ÷ count of `task_completed`.
- Tokens and steps per task over time; `latency_ms` distributions.
- Loop/Retry Ratio: steps with `retry_of_step_id` ÷ total steps.
- Per-tool failure rate: `step_executed` with `status != ok`, grouped by `tool_name`.

**Q — Quality & Drift**
- Human Edit Distance: `edit_magnitude` distributions by `artifact_type`.
- Regression Delta: any change to `agent.version` or `agent.model` is an
  implicit experiment — compare every T/O metric before vs. after.
- Complaint rate: negative `feedback_given` per completed task.

**A — Autonomy & Trust**
- Autonomy Rate: tasks with zero `handoff_to_human` / `human_*` events —
  the agent-PMF indicator.
- Escalation Rate: `handoff_to_human` per task, by `reason`.
- Override/Takeover Rate: `human_overrode` per task.
- Approval Friction: `response_latency_ms` distribution on `human_approved`.

**R — Retention & Expansion**
- Weekly Task Actors: distinct accounts with ≥1 `task_started` per week (replaces DAU).
- Task Depth Expansion: distinct `task_type` values per account over time.
- Delegation Share: agent-initiated (`initiator = agent|schedule`) vs. human-initiated tasks.
- Net Task Growth: week-over-week change in completed tasks per account.

## Status

Schema version `0.1.0`. Shape may change before `1.0.0`; the ten event
names are stable. Feedback via issues welcome.

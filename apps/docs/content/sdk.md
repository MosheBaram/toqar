<!-- claims: events=task_started,task_completed,step_executed -->
# SDK

`@toqar/sdk` emits TOQAR events fire-and-forget: one typed function per
event over a single `track()` chokepoint, with batching, envelope
completion, and a `TOQAR_ANALYTICS_DISABLED` kill switch. Emit
`task_started` at the top of a task, `step_executed` per LLM/tool step,
`task_completed` on success. Delivery never blocks or crashes your loop.

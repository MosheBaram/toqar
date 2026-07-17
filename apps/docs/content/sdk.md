<!-- claims: events=task_started,task_completed,step_executed -->
# SDK

`@toqar/sdk` emits TOQAR events fire-and-forget: one typed function per
event over a single `track()` chokepoint, with batching, envelope
completion, and a `TOQAR_ANALYTICS_DISABLED` kill switch. Emit
`task_started` at the top of a task, `step_executed` per LLM/tool step,
`task_completed` on success. Delivery never blocks or crashes your loop.

## Framework wrappers

Zero-PR first data: wrap the client you already have and `step_executed`
events flow — no manual calls. `wrapAnthropic`, `wrapOpenAI`,
`wrapVercelAI`, and `toqarLangChainCallbacks` share one core, never alter
your call's behavior, and inherit the SDK's never-block guarantee. Wrapper
events and agent-planned instrumentation share the same registry contract.


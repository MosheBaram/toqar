<!-- claims: events=step_executed,task_completed metrics=cost_per_completed_task,tokens_per_task,loop_retry_ratio,per_tool_failure_rate,latency_p95 -->
# O — Operational Efficiency

What does success cost? `cost_per_completed_task` divides all spend —
including failed runs — by completions. `tokens_per_task` and
`latency_p95` track the curve; `loop_retry_ratio` catches agents spinning
on `step_executed` retries; `per_tool_failure_rate` finds the tool that's
quietly eating your success rate. Tool failures, not model quality, cause
most abandoned runs.

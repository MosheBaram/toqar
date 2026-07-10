<!-- claims: events=handoff_to_human,human_approved,human_overrode metrics=autonomy_rate,escalation_rate,override_rate,approval_friction -->
# A — Autonomy & Trust

How much does the agent do alone? `autonomy_rate` is the share of tasks
with zero human intervention — the agent-PMF indicator. `escalation_rate`
counts `handoff_to_human` per task by reason; `override_rate` counts
`human_overrode` takeovers; `approval_friction` is the latency on
`human_approved`. Autonomy rising and overrides falling is the trust
curve you're building.

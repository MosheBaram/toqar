<!-- claims: events=task_completed,task_failed,task_abandoned metrics=task_success_rate,overclaim_rate,first_run_resolution,abandonment_rate -->
# T — Task Success

Did the agent do the job? `task_success_rate` is `task_completed` over
all ended tasks (`task_completed` + `task_failed` + `task_abandoned`).
But completion is a claim: `overclaim_rate` is the share of self-reported
successes that don't hold up. `first_run_resolution` credits getting it
right on the first run; `abandonment_rate` counts the walk-aways. Success
you can't verify isn't success.

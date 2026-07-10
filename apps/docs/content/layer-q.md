<!-- claims: events=human_edited,feedback_given metrics=human_edit_distance,regression_delta,complaint_rate -->
# Q — Quality & Drift

Is the work good, and is it drifting? `human_edit_distance` measures how
much humans rewrite the agent's output (`human_edited`). Every change to
`agent.version` or the model is an implicit experiment —
`regression_delta` compares the metrics before and after. `complaint_rate`
tracks negative `feedback_given` per completed task. Quality regressions
hide until you measure the gap.

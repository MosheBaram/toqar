<!-- claims: metrics=task_success_rate,cost_per_completed_task -->
# MCP

The Toqar MCP server exposes your analytics to your own agents (Claude
Code, Cursor) — read-only, tenant-scoped. Tools: `query_metric` (any
semantic-layer metric, e.g. `task_success_rate` or
`cost_per_completed_task`, with its query id), `list_findings` /
`get_finding`, `get_registry`, `list_experiments` / `get_verdict`. Every
number carries the query that produced it.

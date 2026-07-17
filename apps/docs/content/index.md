<!-- claims: events=task_started,task_completed,task_failed,task_abandoned,step_executed,handoff_to_human,human_approved,human_edited,human_overrode,feedback_given -->
# Toqar

Product analytics for agentic products. The anchor artifact is the TOQAR
schema spec (`packages/registry/README.md`): ten core events and five
metric layers for measuring AI agents doing real work.

The ten core events: `task_started`, `task_completed`, `task_failed`,
`task_abandoned`, `step_executed`, `handoff_to_human`, `human_approved`,
`human_edited`, `human_overrode`, `feedback_given`.

- **[SDK](./sdk.md)** — emit events from your agent.
- **[OpenTelemetry](./otel.md)** — bring your own OTel traces.
- **[MCP](./mcp.md)** — query your analytics from your own agents.
- **[Onboarding](./onboarding.md)** — connect a repo, get instrumented.
- **[Evals](./evals.md)** — trajectory-level scorers, judges, datasets, CI gate.
- **[Alerts](./alerts.md)** — thresholds, anomalies, eval regressions.
- **[Autonomy](./autonomy.md)** — the dial, up to guardrailed rollout.
- **[Data trust](./trust.md)** — redaction, encryption, retention, erasure.
- **[Benchmarks](./benchmarks.md)** — opt-in, k-anonymized cohorts.
- The **TOQAR layers**: [Task success](./layer-t.md) ·
  [Operational efficiency](./layer-o.md) · [Quality & drift](./layer-q.md) ·
  [Autonomy & trust](./layer-a.md) · [Retention](./layer-r.md).

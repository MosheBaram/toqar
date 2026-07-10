# @toqar/docs

The public docs site: static markdown anchored on the TOQAR schema spec,
plus product docs (SDK, OTLP, MCP, onboarding) and the one-post-per-layer
content series.

## The build is the gate

Every doc declares its claims:

```
<!-- claims: events=task_completed,step_executed metrics=task_success_rate -->
```

`pnpm build` validates each claim against `TOQAR_EVENT_NAMES` and the
semantic-layer catalog. A doc that references a non-existent event or
metric **fails the build** — the anti-slop "no aspirational documentation"
rule made mechanical for the public surface, enforced in CI.

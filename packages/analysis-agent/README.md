# @toqar/analysis-agent

The second loop: it analyzes for you. The agent picks and orders
investigation steps; the semantic layer computes every number. Playbooks
are versioned, deterministic step lists, so no arithmetic is ever
LLM-generated and every published figure carries its query id — the
citation contract holds by construction.

## Dependencies

| Package | Why |
| --- | --- |
| `@toqar/analysis` | The deterministic semantic layer: `compileMetric` and the metric/query types every playbook step calls to get real numbers. |
| `@toqar/registry` | The shared contract — metric and event definitions the playbooks and narration reference. |

## What's here

| Module | Purpose |
| --- | --- |
| `playbooks.ts` | Versioned step lists (`PLAYBOOK_VERSION`). A step names a metric + window; the semantic layer runs it. Narration templates interpolate only registered metric value strings. |
| `answer.ts` | Assembles a finding from executed steps — the narrative plus its cited evidence. |
| `sweep.ts` | Honest metric sweeps across a window (no cherry-picking; empty is reported as empty). |
| `slack.ts` | Slack Block Kit rendering and the automated weekly digest. |
| `fixture-executor.ts` | A query executor over fixtures, so playbooks are testable without a live warehouse. |

## Determinism

The agent decides *what to look at*; deterministic code computes *the
numbers*. Every value in a finding resolves to a `compileMetric` query id.
The eval harness drives playbooks against the fixture executor and asserts
the citation validator passes.

## Tests

```bash
pnpm --filter @toqar/analysis-agent test   # playbooks, answer assembly, Slack rendering
```

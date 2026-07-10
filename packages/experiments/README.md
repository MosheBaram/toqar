# @toqar/experiments

The statistics behind the experiment plane. Pure functions, zero LLM
dependencies, deterministic (no `Math.random`).

## Sequential testing

Always-valid inference (Robbins normal-mixture confidence sequence per
arm, alpha split with a union bound on the difference). The point: an
agent monitors *continuously*, and every peek at a fixed-horizon test
inflates the false-positive rate. This construction keeps it bounded by
alpha under unlimited peeking — verified by an A/A test that evaluates
after every observation.

```ts
const test = createSequentialTest({ alpha: 0.05 });
test.observe('control', 1); test.observe('variant', 0); // ...
const { decision, effect, interval, samples } = evaluate(test);
// decision: 'inconclusive' | 'ship' | 'revert'
```

`classicalSampleSize` / `probit` are the fixed-horizon baseline extracted
from `quarry/ab-testing-framework.ts` (provenance in the docblock).

## Flag integration

`FlagProvider` seam over PostHog and LaunchDarkly — Toqar builds no flag
store. `perArmMetricSql` computes guardrail metrics per exposure arm from
existing `toqar.events` (no new event types); its aggregates match the
semantic layer and are verified against real ClickHouse in the pipeline
integration job.

# @toqar/sdk

The shipped client library customers install to emit TOQAR events. Typed
fire-and-forget emitters over a single `track()` chokepoint, with batching,
a bounded buffer, retries, and a kill switch. Delivery can never block or
crash the host: on failure it warns and drops.

## Dependencies

| Package | Why |
| --- | --- |
| `@toqar/registry` | `SCHEMA_VERSION`, the event schema (`toqarEventSchema`) for optional dev-mode validation, and the `AgentIdentity` type. |

## Usage

```ts
import { createToqarClient } from '@toqar/sdk';

const toqar = createToqarClient({
  endpoint: 'https://collect.example.com', // events POST to `${endpoint}/v1/events`
  token: process.env.TOQAR_TOKEN!,
  agent: { name: 'my-agent', version: '1.4.0' },
});

const ctx = { task_id, run_id, task_type: 'summarize' };
toqar.analytics.taskStarted(ctx, { initiator: 'api' });
toqar.analytics.stepExecuted(ctx, {
  step_id, step_index: 0, step_type: 'llm_call',
  model: 'claude-opus-4-8', tokens_in, tokens_out, latency_ms, status: 'ok',
});
toqar.analytics.taskCompleted(ctx, { verification: 'verified', duration_ms, steps_total });

await toqar.flush(); // e.g. before process exit
```

There is one emitter per TOQAR core event (`task_started`, `task_completed`,
`task_failed`, `task_abandoned`, `step_executed`, `handoff_to_human`,
`human_approved`, `human_edited`, `human_overrode`, `feedback_given`). Each
completes the event envelope and enqueues it; batches auto-flush on an
interval and when full.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `flushIntervalMs` | `2000` | Auto-flush interval. |
| `maxBatch` | `20` | Max events per POST. |
| `maxBuffered` | `1000` | Buffer cap; oldest are dropped (with a warning) past it. |
| `maxRetries` | `2` | Delivery attempts per batch before dropping. |
| `devValidate` | `false` | Validate payloads against `toqarEventSchema` before queueing. |
| `onWarn` | — | Sink for delivery warnings (drops, failures). |
| `fetchImpl` | global `fetch` | Injectable transport (for tests). |

## Tests

```bash
pnpm --filter @toqar/sdk test
```

`client.test.ts` drives the client with an injected `fetchImpl` — batching,
buffer eviction, retries, the kill switch, and never-throw delivery.

## Framework wrappers (spec: sdk-node)

Zero-PR first data: wrap the client the app already has and `step_executed`
events flow — no manual `track()` calls, same registry contract as
agent-planned instrumentation, same never-block guarantees.

```ts
import { wrapAnthropic, wrapOpenAI, wrapVercelAI, toqarLangChainCallbacks } from '@toqar/sdk';

wrapAnthropic(anthropic, toqar, ctx);          // every messages.create
wrapOpenAI(openai, toqar, ctx);                // every chat.completions.create
const generate = wrapVercelAI(generateText, toqar, ctx);
const callbacks = [toqarLangChainCallbacks(toqar, ctx)]; // LangChain/LangGraph
```

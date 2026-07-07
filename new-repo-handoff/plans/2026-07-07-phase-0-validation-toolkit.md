# Phase 0 — Validation Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything the 8-week concierge validation needs — TypeScript monorepo, TOQAR event registry package, the concierge instrumentation skill, the public schema spec, and the validation ops kit — and nothing more.

**Architecture:** A pnpm-workspaces monorepo with a single library package (`@toqar/registry`) holding the TOQAR event schemas (Zod), registry-entry/tracking-plan types, and a markdown renderer. The instrumentation skill lives in `skills/` as a Claude Code skill and consumes the registry's vocabulary. Validation ops docs live in `docs/validation/`. No services, no ingestion, no dashboard in Phase 0.

**Tech Stack:** TypeScript 5.x (strict), pnpm workspaces, Zod 3, vitest 2, Node ≥ 20.

**Deliberate deviation from the brief:** the brief suggested NX. This plan uses plain pnpm workspaces instead — one package doesn't need a build orchestrator, every scaffold file is written explicitly below (no generator magic), and NX can be layered on in Phase 1 when there are multiple packages with real build graphs. Override this if you disagree; nothing else depends on it.

## Global Constraints

- Node `>=20`; package manager pnpm; TypeScript `strict: true` everywhere.
- No fake data in product code: `Math.random`, hardcoded metric values, and mock implementations are forbidden outside `*.test.ts` files.
- Docs may only claim what is implemented and verified.
- Every commit typechecks (`pnpm typecheck`) and passes tests (`pnpm test`).
- Event names and property names are `snake_case`; schema version starts at `0.1.0`.
- No new packages beyond `packages/registry` in Phase 0.
- Event payloads must never carry raw user content or PII — large/sensitive payloads are referenced via `*_ref` string pointers.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: root scripts `pnpm test`, `pnpm typecheck`, `pnpm build` that recurse into workspace packages; `tsconfig.base.json` for packages to extend.

- [ ] **Step 1: Initialize git and write root files**

`package.json`:

```json
{
  "name": "toqar",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.6.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
coverage/
.env
.DS_Store
```

`README.md`:

```markdown
# Toqar

Product analytics for agentic products, built agent-first. Currently in
Phase 0: the validation toolkit for an 8-week design-partner concierge test.

## What exists today

- `packages/registry` — TOQAR event schemas (typed, Zod-validated),
  registry-entry and tracking-plan types, tracking-plan markdown renderer.
- `skills/instrument-agentic-app` — Claude Code skill that instruments a
  design partner's repo with TOQAR events via PR.
- `docs/validation` — templates and scorecard for the concierge validation.

Nothing else. No ingestion, no dashboard, no services — by design, until
validation reads green. See `KICKOFF-PROMPT.md` for the full spec.

## Development

    pnpm install
    pnpm test
    pnpm typecheck
```

- [ ] **Step 2: Install and verify**

Run: `git init && pnpm install`
Expected: lockfile created, no errors. (`pnpm -r test` legitimately does nothing yet — no packages.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace monorepo"
```

---

### Task 2: Registry package — event envelope

**Files:**
- Create: `packages/registry/package.json`
- Create: `packages/registry/tsconfig.json`
- Create: `packages/registry/vitest.config.ts`
- Create: `packages/registry/src/envelope.ts`
- Test: `packages/registry/src/envelope.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` from Task 1.
- Produces: `eventEnvelopeSchema` (Zod object), `agentIdentitySchema`, type `EventEnvelope`, const `SCHEMA_VERSION = '0.1.0'` — Task 3 extends `eventEnvelopeSchema` for every concrete event.

- [ ] **Step 1: Write package scaffolding**

`packages/registry/package.json`:

```json
{
  "name": "@toqar/registry",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`packages/registry/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/registry/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test**

`packages/registry/src/envelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema, SCHEMA_VERSION } from './envelope.js';

export function validEnvelope() {
  return {
    event_id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    timestamp: '2026-07-07T12:00:00.000Z',
    task_id: 'task_9f2c',
    run_id: 'run_01',
    task_type: 'reply_to_lead',
    agent: { name: 'sdr-agent', version: '1.4.2', model: 'claude-sonnet-5' },
  };
}

describe('eventEnvelopeSchema', () => {
  it('accepts a fully-specified envelope', () => {
    expect(eventEnvelopeSchema.safeParse(validEnvelope()).success).toBe(true);
  });

  it('accepts an envelope without optional fields', () => {
    const { agent, ...rest } = validEnvelope();
    const minimal = { ...rest, agent: { name: 'sdr-agent' } };
    expect(eventEnvelopeSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects a non-uuid event_id', () => {
    const bad = { ...validEnvelope(), event_id: 'not-a-uuid' };
    expect(eventEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing task_type', () => {
    const { task_type, ...bad } = validEnvelope();
    expect(eventEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-ISO timestamp', () => {
    const bad = { ...validEnvelope(), timestamp: '07/07/2026' };
    expect(eventEnvelopeSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @toqar/registry test`
Expected: FAIL — cannot resolve `./envelope.js`.

- [ ] **Step 4: Write the implementation**

`packages/registry/src/envelope.ts`:

```ts
import { z } from 'zod';

export const SCHEMA_VERSION = '0.1.0';

/** Identity of the agent (the software actor) emitting events. */
export const agentIdentitySchema = z.object({
  /** Stable agent name, e.g. "sdr-agent". */
  name: z.string().min(1),
  /** Version of the agent — semver or git sha. Drives Regression Delta. */
  version: z.string().min(1).optional(),
  /** Default model powering the agent, e.g. "claude-sonnet-5". */
  model: z.string().min(1).optional(),
});

/**
 * Common envelope carried by every TOQAR event. Concrete events extend
 * this with an `event` discriminator literal and event-specific fields.
 *
 * PII rule: no raw user content in any envelope or event property.
 * Large or sensitive payloads are referenced via `*_ref` pointers into
 * the customer's own storage.
 */
export const eventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  schema_version: z.string().min(1),
  /** ISO 8601 with timezone offset. */
  timestamp: z.string().datetime({ offset: true }),
  /** The Task is the unit of value. */
  task_id: z.string().min(1),
  /** One attempt at a task. Retries create new runs on the same task. */
  run_id: z.string().min(1),
  /** Stable snake_case task taxonomy name, e.g. "reply_to_lead". */
  task_type: z.string().min(1),
  agent: agentIdentitySchema,
  /** Human-side session bridging agent work to classic web analytics. */
  session_id: z.string().min(1).optional(),
});

export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm install && pnpm --filter @toqar/registry test`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/registry pnpm-lock.yaml
git commit -m "feat(registry): event envelope schema with agent identity"
```

---

### Task 3: The ten TOQAR core events

**Files:**
- Create: `packages/registry/src/events.ts`
- Create: `packages/registry/src/index.ts`
- Test: `packages/registry/src/events.test.ts`

**Interfaces:**
- Consumes: `eventEnvelopeSchema` from Task 2 (extended per event).
- Produces: ten schemas (`taskStartedSchema`, `taskCompletedSchema`, `taskFailedSchema`, `taskAbandonedSchema`, `stepExecutedSchema`, `handoffToHumanSchema`, `humanApprovedSchema`, `humanEditedSchema`, `humanOverrodeSchema`, `feedbackGivenSchema`), the discriminated union `toqarEventSchema` (discriminator field: `event`), type `ToqarEvent`, and const `TOQAR_EVENT_NAMES: readonly string[]`. Tasks 4–6 depend on `toqarEventSchema` and `TOQAR_EVENT_NAMES`.

- [ ] **Step 1: Write the failing test**

`packages/registry/src/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from './envelope.js';
import {
  stepExecutedSchema,
  taskCompletedSchema,
  TOQAR_EVENT_NAMES,
  toqarEventSchema,
} from './events.js';

function envelope() {
  return {
    event_id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    timestamp: '2026-07-07T12:00:00.000Z',
    task_id: 'task_9f2c',
    run_id: 'run_01',
    task_type: 'reply_to_lead',
    agent: { name: 'sdr-agent', version: '1.4.2' },
  };
}

describe('toqarEventSchema', () => {
  it('exposes exactly the 10 core event names', () => {
    expect([...TOQAR_EVENT_NAMES].sort()).toEqual([
      'feedback_given',
      'handoff_to_human',
      'human_approved',
      'human_edited',
      'human_overrode',
      'step_executed',
      'task_abandoned',
      'task_completed',
      'task_failed',
      'task_started',
    ]);
  });

  it('accepts a valid task_started', () => {
    const parsed = toqarEventSchema.safeParse({
      ...envelope(),
      event: 'task_started',
      initiator: 'human',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a valid task_completed with cost metrics', () => {
    const parsed = taskCompletedSchema.safeParse({
      ...envelope(),
      event: 'task_completed',
      verification: 'verified',
      verifier: 'ci_tests',
      duration_ms: 84_000,
      steps_total: 12,
      tokens_in_total: 40_000,
      tokens_out_total: 6_000,
      cost_usd: 0.42,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects task_completed with an unknown verification value', () => {
    const parsed = taskCompletedSchema.safeParse({
      ...envelope(),
      event: 'task_completed',
      verification: 'probably_fine',
      duration_ms: 1,
      steps_total: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a step_executed tool call with an error', () => {
    const parsed = stepExecutedSchema.safeParse({
      ...envelope(),
      event: 'step_executed',
      step_id: 'step_07',
      step_index: 7,
      step_type: 'tool_call',
      tool_name: 'crm_lookup',
      latency_ms: 1_800,
      status: 'error',
      error: { type: 'rate_limited', message: '429 from CRM' },
      retry_of_step_id: 'step_05',
    });
    expect(parsed.success).toBe(true);
  });

  it('routes union parsing by the event discriminator', () => {
    const parsed = toqarEventSchema.safeParse({
      ...envelope(),
      event: 'handoff_to_human',
      handoff_id: 'ho_1',
      reason: 'approval_required',
      blocking: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.event).toBe('handoff_to_human');
  });

  it('rejects an unknown event name', () => {
    const parsed = toqarEventSchema.safeParse({
      ...envelope(),
      event: 'page_view',
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @toqar/registry test`
Expected: FAIL — cannot resolve `./events.js`.

- [ ] **Step 3: Write the implementation**

`packages/registry/src/events.ts`:

```ts
import { z } from 'zod';
import { eventEnvelopeSchema } from './envelope.js';

const errorInfoSchema = z.object({
  /** Stable machine-readable error class, e.g. "rate_limited". */
  type: z.string().min(1),
  message: z.string().optional(),
});

/** A task began. Emitted once per task, before the first run. */
export const taskStartedSchema = eventEnvelopeSchema.extend({
  event: z.literal('task_started'),
  initiator: z.enum(['human', 'agent', 'schedule', 'api']),
  /** Set when an agent spawned this task from another task. */
  parent_task_id: z.string().min(1).optional(),
  /** Pointer to the task input in the customer's storage. Never inline. */
  input_ref: z.string().min(1).optional(),
});

/**
 * The task finished with a success claim. `verification` separates
 * verified success from the agent's self-report — the gap between the
 * two is the Overclaim Rate (layer T).
 */
export const taskCompletedSchema = eventEnvelopeSchema.extend({
  event: z.literal('task_completed'),
  verification: z.enum(['verified', 'self_reported']),
  /** What verified it, e.g. "ci_tests", "human_review", "webhook_ack". */
  verifier: z.string().min(1).optional(),
  duration_ms: z.number().int().nonnegative(),
  steps_total: z.number().int().nonnegative(),
  tokens_in_total: z.number().int().nonnegative().optional(),
  tokens_out_total: z.number().int().nonnegative().optional(),
  /** Marginal cost of this task across all runs. Drives CPCT (layer O). */
  cost_usd: z.number().nonnegative().optional(),
  output_ref: z.string().min(1).optional(),
});

export const taskFailedSchema = eventEnvelopeSchema.extend({
  event: z.literal('task_failed'),
  error: errorInfoSchema,
  failed_step_id: z.string().min(1).optional(),
  retryable: z.boolean(),
  duration_ms: z.number().int().nonnegative(),
});

/** The task was walked away from without an outcome (layer T). */
export const taskAbandonedSchema = eventEnvelopeSchema.extend({
  event: z.literal('task_abandoned'),
  abandoned_by: z.enum(['human', 'timeout', 'system']),
  reason: z.string().optional(),
  duration_ms: z.number().int().nonnegative(),
});

/**
 * One step inside a run — the workhorse event. Tool failure rates,
 * token/latency trends, and Loop/Retry Ratio all derive from it.
 */
export const stepExecutedSchema = eventEnvelopeSchema.extend({
  event: z.literal('step_executed'),
  step_id: z.string().min(1),
  /** 0-based position within the run. */
  step_index: z.number().int().nonnegative(),
  step_type: z.enum([
    'llm_call',
    'tool_call',
    'retrieval',
    'code_execution',
    'handoff',
    'other',
  ]),
  /** Required when step_type is "tool_call". */
  tool_name: z.string().min(1).optional(),
  /** Model used, when step_type is "llm_call". */
  model: z.string().min(1).optional(),
  tokens_in: z.number().int().nonnegative().optional(),
  tokens_out: z.number().int().nonnegative().optional(),
  latency_ms: z.number().int().nonnegative(),
  status: z.enum(['ok', 'error', 'timeout']),
  error: errorInfoSchema.optional(),
  /** Set when this step retries an earlier one. Drives Loop/Retry Ratio. */
  retry_of_step_id: z.string().min(1).optional(),
});

/** The agent paused and asked a human (layer A). */
export const handoffToHumanSchema = eventEnvelopeSchema.extend({
  event: z.literal('handoff_to_human'),
  handoff_id: z.string().min(1),
  reason: z.enum([
    'approval_required',
    'low_confidence',
    'error',
    'policy',
    'clarification',
    'user_request',
  ]),
  /** True when the task cannot proceed until the human responds. */
  blocking: z.boolean(),
  context_ref: z.string().min(1).optional(),
});

/** Human approved a handoff. Latency here is Approval Friction (layer A). */
export const humanApprovedSchema = eventEnvelopeSchema.extend({
  event: z.literal('human_approved'),
  handoff_id: z.string().min(1),
  response_latency_ms: z.number().int().nonnegative(),
});

/** Human changed the agent's output. Magnitude is Human Edit Distance (Q). */
export const humanEditedSchema = eventEnvelopeSchema.extend({
  event: z.literal('human_edited'),
  handoff_id: z.string().min(1).optional(),
  /** What was edited, e.g. "email_draft", "code_patch", "sql_query". */
  artifact_type: z.string().min(1),
  edit_magnitude: z
    .object({
      unit: z.enum(['chars', 'tokens', 'lines']),
      value: z.number().int().nonnegative(),
    })
    .optional(),
});

/** Human took over or discarded the agent's work entirely (layer A). */
export const humanOverrodeSchema = eventEnvelopeSchema.extend({
  event: z.literal('human_overrode'),
  handoff_id: z.string().min(1).optional(),
  takeover_step_id: z.string().min(1).optional(),
  reason: z.string().optional(),
});

/** Explicit satisfaction signal from a person (layers Q and T). */
export const feedbackGivenSchema = eventEnvelopeSchema.extend({
  event: z.literal('feedback_given'),
  rating: z.object({
    kind: z.enum(['binary', 'scale']),
    /** binary: 0 or 1; scale: 1–5. */
    value: z.number(),
  }),
  source: z.enum(['end_user', 'operator']),
  comment_ref: z.string().min(1).optional(),
});

export const toqarEventSchema = z.discriminatedUnion('event', [
  taskStartedSchema,
  taskCompletedSchema,
  taskFailedSchema,
  taskAbandonedSchema,
  stepExecutedSchema,
  handoffToHumanSchema,
  humanApprovedSchema,
  humanEditedSchema,
  humanOverrodeSchema,
  feedbackGivenSchema,
]);

export type ToqarEvent = z.infer<typeof toqarEventSchema>;
export type ToqarEventName = ToqarEvent['event'];

export const TOQAR_EVENT_NAMES = [
  'task_started',
  'task_completed',
  'task_failed',
  'task_abandoned',
  'step_executed',
  'handoff_to_human',
  'human_approved',
  'human_edited',
  'human_overrode',
  'feedback_given',
] as const satisfies readonly ToqarEventName[];
```

`packages/registry/src/index.ts`:

```ts
export * from './envelope.js';
export * from './events.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @toqar/registry test`
Expected: all tests PASS (envelope 5 + events 7).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add packages/registry
git commit -m "feat(registry): ten TOQAR core event schemas as a discriminated union"
```

---

### Task 4: Registry entries and the tracking-plan diff format

**Files:**
- Create: `packages/registry/src/tracking-plan.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/src/tracking-plan.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 2–3 at runtime (standalone types); shares the vocabulary.
- Produces: `registryEntrySchema`, `plannedEventSchema`, `trackingPlanSchema`, types `RegistryEntry`, `PlannedEvent`, `TrackingPlan`, and `renderTrackingPlan(plan: TrackingPlan): string` returning markdown. The instrumentation skill (Task 6) instructs the agent to emit JSON matching `trackingPlanSchema` and render it with `renderTrackingPlan`.

- [ ] **Step 1: Write the failing test**

`packages/registry/src/tracking-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  renderTrackingPlan,
  type TrackingPlan,
  trackingPlanSchema,
} from './tracking-plan.js';

const plan: TrackingPlan = {
  repo: 'acme/sdr-agent',
  generated_at: '2026-07-07T12:00:00.000Z',
  summary: 'Wire the 10 TOQAR core events plus 2 product events.',
  added: [
    {
      event: 'task_started',
      description: 'An outreach task begins for a lead.',
      journey: 'lead_outreach',
      owner_metric: 'task_success_rate',
      hypothesis: 'TSR for cold outreach is below 60%.',
      status: 'proposed',
      since_version: '0.1.0',
      code_locations: ['src/workers/outreach.ts:42'],
      implementation_notes: 'Emit at the top of the queue consumer.',
    },
  ],
  modified: [],
  removed: [],
};

describe('trackingPlanSchema', () => {
  it('accepts a valid plan', () => {
    expect(trackingPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects a planned event without code_locations', () => {
    const first = plan.added[0]!;
    const { code_locations, ...bare } = first;
    const bad = { ...plan, added: [bare] };
    expect(trackingPlanSchema.safeParse(bad).success).toBe(false);
  });
});

describe('renderTrackingPlan', () => {
  it('renders repo, summary, and one row per added event', () => {
    const md = renderTrackingPlan(plan);
    expect(md).toContain('# Tracking Plan — acme/sdr-agent');
    expect(md).toContain(plan.summary);
    expect(md).toContain('`task_started`');
    expect(md).toContain('task_success_rate');
    expect(md).toContain('src/workers/outreach.ts:42');
  });

  it('omits empty sections', () => {
    const md = renderTrackingPlan(plan);
    expect(md).not.toContain('## Modified events');
    expect(md).not.toContain('## Removed events');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @toqar/registry test`
Expected: FAIL — cannot resolve `./tracking-plan.js`.

- [ ] **Step 3: Write the implementation**

`packages/registry/src/tracking-plan.ts`:

```ts
import { z } from 'zod';

/**
 * A registry entry is an event's identity card: not just its shape, but
 * its journey and its reason for existing (design principle 3 — every
 * event serves a named metric or hypothesis).
 */
export const registryEntrySchema = z.object({
  event: z.string().min(1),
  description: z.string().min(1),
  /** The user/agent journey this event belongs to, e.g. "lead_outreach". */
  journey: z.string().min(1),
  /** The metric this event exists to serve, e.g. "task_success_rate". */
  owner_metric: z.string().min(1),
  /** The question or bet behind the metric, when there is one. */
  hypothesis: z.string().min(1).optional(),
  status: z.enum(['proposed', 'active', 'deprecated']),
  since_version: z.string().min(1),
});

/** A registry entry plus where and how it gets implemented. */
export const plannedEventSchema = registryEntrySchema.extend({
  /** "path/to/file.ts:line" anchors for every emission site. */
  code_locations: z.array(z.string().min(1)).min(1),
  implementation_notes: z.string().min(1),
});

/**
 * The tracking plan is a *diff against the registry* — the reviewable
 * artifact the instrumentation agent proposes before writing code.
 */
export const trackingPlanSchema = z.object({
  repo: z.string().min(1),
  generated_at: z.string().datetime({ offset: true }),
  summary: z.string().min(1),
  added: z.array(plannedEventSchema),
  modified: z.array(plannedEventSchema),
  removed: z.array(
    z.object({ event: z.string().min(1), reason: z.string().min(1) }),
  ),
});

export type RegistryEntry = z.infer<typeof registryEntrySchema>;
export type PlannedEvent = z.infer<typeof plannedEventSchema>;
export type TrackingPlan = z.infer<typeof trackingPlanSchema>;

function eventSection(title: string, events: PlannedEvent[]): string {
  if (events.length === 0) return '';
  const rows = events
    .map(
      (e) =>
        `| \`${e.event}\` | ${e.journey} | ${e.owner_metric} | ${e.status} |`,
    )
    .join('\n');
  const details = events
    .map((e) => {
      const hypothesis = e.hypothesis ? `\n- Hypothesis: ${e.hypothesis}` : '';
      const locations = e.code_locations.map((l) => `\`${l}\``).join(', ');
      return [
        `### \`${e.event}\``,
        '',
        e.description + hypothesis,
        `- Owner metric: ${e.owner_metric}`,
        `- Code locations: ${locations}`,
        `- Implementation: ${e.implementation_notes}`,
      ].join('\n');
    })
    .join('\n\n');
  return [
    `## ${title}`,
    '',
    '| Event | Journey | Owner metric | Status |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    details,
    '',
  ].join('\n');
}

/** Render a tracking plan as the human-reviewable markdown document. */
export function renderTrackingPlan(plan: TrackingPlan): string {
  const removed =
    plan.removed.length === 0
      ? ''
      : [
          '## Removed events',
          '',
          ...plan.removed.map((r) => `- \`${r.event}\` — ${r.reason}`),
          '',
        ].join('\n');
  return [
    `# Tracking Plan — ${plan.repo}`,
    '',
    `Generated: ${plan.generated_at}`,
    '',
    plan.summary,
    '',
    eventSection('Added events', plan.added),
    eventSection('Modified events', plan.modified),
    removed,
  ]
    .filter((s) => s !== '')
    .join('\n')
    .concat('\n');
}
```

Append to `packages/registry/src/index.ts`:

```ts
export * from './tracking-plan.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @toqar/registry test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/registry
git commit -m "feat(registry): tracking-plan diff format with markdown renderer"
```

---

### Task 5: Public schema spec (registry README)

**Files:**
- Create: `packages/registry/README.md`

**Interfaces:**
- Consumes: names and semantics from Tasks 3–4 (must match the code exactly).
- Produces: the public content artifact; the skill's tracking-plan template (Task 6) links to it.

- [ ] **Step 1: Write the README**

`packages/registry/README.md`:

```markdown
# TOQAR — an open event schema for agentic products

Classic product analytics counts page views and clicks. Agentic products
do work: they take on tasks, execute steps, hand off to humans, and get
overruled. TOQAR is a typed event schema for measuring that — ten core
events and five metric layers. This package is the reference
implementation (TypeScript + Zod).

## Primitives

- **Task** — the unit of value ("reply to this lead"). Has an outcome.
- **Run** — one attempt at a task. Retries create new runs, same task.
- **Step** — one action inside a run: an LLM call, a tool call, a retrieval.
- **Handoff** — control passing between agent and human.
- **Session** — the human-side bridge to classic web analytics.

## The ten core events

| Event | When | Key properties |
| --- | --- | --- |
| `task_started` | A task begins | `initiator`, `parent_task_id?`, `input_ref?` |
| `task_completed` | Task ends in claimed success | `verification` (verified \| self_reported), `verifier?`, `duration_ms`, `steps_total`, `tokens_*_total?`, `cost_usd?` |
| `task_failed` | Task ends in failure | `error.type`, `retryable`, `failed_step_id?`, `duration_ms` |
| `task_abandoned` | Task walked away from | `abandoned_by` (human \| timeout \| system), `duration_ms` |
| `step_executed` | Every step, success or not | `step_type`, `tool_name?`, `model?`, `tokens_in/out?`, `latency_ms`, `status`, `error?`, `retry_of_step_id?` |
| `handoff_to_human` | Agent asks a human | `reason`, `blocking`, `handoff_id` |
| `human_approved` | Human approves a handoff | `handoff_id`, `response_latency_ms` |
| `human_edited` | Human changes agent output | `artifact_type`, `edit_magnitude?` (chars \| tokens \| lines) |
| `human_overrode` | Human takes over / discards | `takeover_step_id?`, `reason?` |
| `feedback_given` | Explicit satisfaction signal | `rating` (binary \| scale), `source` |

Every event shares a common envelope: `event_id`, `schema_version`,
`timestamp`, `task_id`, `run_id`, `task_type`, `agent { name, version?,
model? }`, `session_id?`. Full property specs with validation rules are
in `src/events.ts`. Privacy rule: no raw user content in properties —
large or sensitive payloads travel as `*_ref` pointers into your own
storage.

## The five layers and how metrics derive from events

**T — Task Success**
- Task Success Rate (by `task_type`): `task_completed` / (`task_completed` + `task_failed` + `task_abandoned`).
- Overclaim Rate: share of `task_completed` with `verification = self_reported` that later attract `human_edited`, `human_overrode`, or negative `feedback_given` — the gap between what the agent claims and what holds up.
- First-Run Resolution: tasks whose success came on `run_id` #1.
- Abandonment: `task_abandoned` share, segmented by `abandoned_by`.

**O — Operational Efficiency**
- Cost per Completed Task: sum of `cost_usd` across **all** runs (failed included) ÷ count of `task_completed`.
- Tokens and steps per task over time; `latency_ms` distributions.
- Loop/Retry Ratio: steps with `retry_of_step_id` ÷ total steps.
- Per-tool failure rate: `step_executed` with `status != ok`, grouped by `tool_name`.

**Q — Quality & Drift**
- Human Edit Distance: `edit_magnitude` distributions by `artifact_type`.
- Regression Delta: any change to `agent.version` or `agent.model` is an
  implicit experiment — compare every T/O metric before vs. after.
- Complaint rate: negative `feedback_given` per completed task.

**A — Autonomy & Trust**
- Autonomy Rate: tasks with zero `handoff_to_human` / `human_*` events —
  the agent-PMF indicator.
- Escalation Rate: `handoff_to_human` per task, by `reason`.
- Override/Takeover Rate: `human_overrode` per task.
- Approval Friction: `response_latency_ms` distribution on `human_approved`.

**R — Retention & Expansion**
- Weekly Task Actors: distinct accounts with ≥1 `task_started` per week (replaces DAU).
- Task Depth Expansion: distinct `task_type` values per account over time.
- Delegation Share: agent-initiated (`initiator = agent|schedule`) vs. human-initiated tasks.
- Net Task Growth: week-over-week change in completed tasks per account.

## Status

Schema version `0.1.0`. Shape may change before `1.0.0`; the ten event
names are stable. Feedback via issues welcome.
```

- [ ] **Step 2: Verify claims against code**

Check the event names and property names in the README against `src/events.ts` — they must match exactly (the anti-slop rule: docs only claim what the code does).

- [ ] **Step 3: Commit**

```bash
git add packages/registry/README.md
git commit -m "docs(registry): public TOQAR schema spec"
```

---

### Task 6: The concierge instrumentation skill

**Files:**
- Create: `skills/instrument-agentic-app/SKILL.md`
- Create: `skills/instrument-agentic-app/templates/tracking-plan.md`
- Create: `skills/instrument-agentic-app/templates/pr-body.md`
- Create: `skills/instrument-agentic-app/templates/analytics-wrapper.ts`

**Interfaces:**
- Consumes: `TOQAR_EVENT_NAMES` and event semantics (Task 3), tracking-plan format (Task 4), spec README (Task 5) — referenced by path, not imported.
- Produces: the skill invoked as `/instrument-agentic-app` inside a design partner's repo. This is v0 of the product.

- [ ] **Step 1: Write SKILL.md**

`skills/instrument-agentic-app/SKILL.md`:

```markdown
---
name: instrument-agentic-app
description: Instrument an agentic product's codebase with TOQAR analytics events. Use when onboarding a design partner or asked to add task/step/handoff tracking to an agent codebase. Produces a tracking plan for review, then an instrumentation PR.
---

# Instrument an Agentic App

You are the concierge instrumentation agent. Given a design partner's
repo, you produce (1) a tracking plan as a registry diff, pause for
human review, then (2) a small, mergeable instrumentation PR.

**Quality bar: the PR must be mergeable with at most minor edits.**
A rejected PR is a failed engagement (validation kill-criterion A1).

## Hard rules

- Never invent data or emit placeholder events. Every emission site must
  correspond to real behavior in their code.
- Never block the agent loop: analytics calls are fire-and-forget,
  errors swallowed and logged, never thrown.
- Never put raw user content, prompts, or outputs into event properties.
  Use `*_ref` string pointers into the customer's own storage.
- Never restructure their code. Instrumentation is additive: one wrapper
  module + thin calls at existing seams.
- Stop for explicit human approval between the tracking plan and the
  implementation. Never skip the review gate.

## Inputs — collect before starting

1. Destination: their PostHog project key, or the hosted ClickHouse HTTP
   endpoint + token we provisioned. (Wizard-of-oz: we build no ingestion.)
2. Their "3 unanswerable questions", verbatim, from the intake doc.
3. Repo access and permission to open a PR.

## Phase 1 — Map the agent loop (read-only)

1. Read README, docs, `package.json`. Identify the agent framework: raw
   Anthropic/OpenAI SDK calls, Vercel AI SDK, LangChain, Mastra, custom.
2. Find the seams by searching for:
   - Task starts: queue consumers, cron handlers, API routes, webhook
     handlers that kick off agent work.
   - Steps: LLM SDK call sites (`anthropic.messages.create`,
     `generateText`, `chat.completions`), tool dispatch functions,
     retrieval calls.
   - Outcomes: where the loop decides success/failure/give-up.
   - Handoffs: approval UIs, Slack/email review steps, human queues.
   - Verification: tests, webhook acks, downstream confirmations that
     could upgrade `self_reported` to `verified`.
3. Write the task taxonomy: 1–5 `task_type` names, snake_case, named
   after the unit of value ("reply_to_lead", not "run_agent").

## Phase 2 — Tracking plan (the review gate)

1. Draft 10–20 events: the 10 TOQAR core events (see
   `packages/registry/README.md` in the toqar repo for
   semantics) plus up to 10 product-specific events, each tied to one of
   their 3 unanswerable questions.
2. Every event gets: `journey`, `owner_metric`, `hypothesis` (which
   question it answers), `code_locations` (`file:line`), and
   `implementation_notes`. An event with no owner metric does not ship.
3. Render using `templates/tracking-plan.md`; save as
   `analytics/tracking-plan.md` on a new branch in their repo.
4. **STOP. Present the plan and wait for approval.** Adjust as asked.

## Phase 3 — Implement

1. Create `src/analytics.ts` (or their conventional location) from
   `templates/analytics-wrapper.ts`: one typed function per event, all
   routing through a single `track()` with fire-and-forget delivery.
2. Insert calls at the seams from the plan. Envelope fields: generate
   `event_id` per event; propagate `task_id`/`run_id` through existing
   context (add a small context object only if unavoidable).
3. Populate `agent.version` from their release identifier (git sha, env
   var, or package version — whatever they already have).
4. Run their typecheck, lint, and test commands. All must pass.

## Phase 4 — PR

1. Branch: `analytics/toqar-instrumentation`. Keep the diff to: wrapper
   module, call-site insertions, `analytics/tracking-plan.md`, and (if
   needed) one config/env entry.
2. PR body from `templates/pr-body.md` — includes event inventory,
   privacy notes, and the one-line rollback (delete the wrapper).
3. Deliver the PR link. Log the date for the validation scorecard.
```

- [ ] **Step 2: Write the tracking-plan template**

`skills/instrument-agentic-app/templates/tracking-plan.md`:

```markdown
# Tracking Plan — {{repo}}

Generated: {{iso_timestamp}} · Schema: TOQAR 0.1.0 · Status: proposed

{{one-paragraph summary: what this instruments and which of the
partner's three questions it will make answerable}}

## Your three questions, and the events that answer them

1. "{{question 1 verbatim}}" → {{events + metric}}
2. "{{question 2 verbatim}}" → {{events + metric}}
3. "{{question 3 verbatim}}" → {{events + metric}}

## Added events

| Event | Journey | Owner metric | Status |
| --- | --- | --- | --- |
| `{{event}}` | {{journey}} | {{owner_metric}} | proposed |

### `{{event}}`

{{description}}
- Hypothesis: {{hypothesis}}
- Owner metric: {{owner_metric}}
- Code locations: `{{file:line}}`
- Implementation: {{notes}}

{{repeat per event}}

## Privacy

No raw user content, prompts, or model outputs are captured. Sensitive
payloads are referenced by ID (`*_ref` fields) into your own storage.

## Review checklist for you

- [ ] Task taxonomy names match how you talk about the product
- [ ] Every event's owner metric is one you actually want
- [ ] Code locations look like the right seams
- [ ] Nothing here captures content you consider sensitive
```

- [ ] **Step 3: Write the PR-body template**

`skills/instrument-agentic-app/templates/pr-body.md`:

```markdown
## TOQAR analytics instrumentation

Implements the tracking plan in `analytics/tracking-plan.md`
({{n}} events: {{k}} TOQAR core + {{m}} product-specific).

### What this adds

- `src/analytics.ts` — one typed emit function per event; all delivery
  is fire-and-forget (analytics can never block or crash the agent loop).
- Call sites at {{count}} seams (listed in the tracking plan with
  `file:line` anchors).

### What this does not do

- No raw prompts, outputs, or user content leave your systems — only
  IDs, enums, counts, latencies, and costs.
- No behavior changes: every insertion is additive and side-effect-free
  for your control flow.

### Verification

- `{{their typecheck command}}` ✅
- `{{their test command}}` ✅

### Rollback

Delete `src/analytics.ts` and the call sites (grep `analytics.`), or
set `{{ANALYTICS_DISABLED_ENV_VAR}}=1`.
```

- [ ] **Step 4: Write the wrapper template**

`skills/instrument-agentic-app/templates/analytics-wrapper.ts`:

```ts
/**
 * TOQAR analytics wrapper — TEMPLATE.
 * Adapt destination + context plumbing to the host repo. Keep the shape:
 * one typed function per event, single track() chokepoint, fire-and-forget.
 */

type Destination = { capture: (event: string, props: object) => void };

// PostHog variant (their free tier). Swap for an HTTP POST to the hosted
// ClickHouse collector when that is the engagement's destination.
function makeDestination(): Destination {
  if (process.env.ANALYTICS_DISABLED === '1') {
    return { capture: () => {} };
  }
  // e.g. posthog-node: new PostHog(process.env.POSTHOG_KEY!, { host: ... })
  throw new Error('wire the destination for this repo');
}

const destination = makeDestination();

export interface TaskContext {
  task_id: string;
  run_id: string;
  task_type: string;
  session_id?: string;
}

const AGENT = {
  name: 'REPLACE_agent_name',
  version: process.env.RELEASE_SHA,
  model: 'REPLACE_default_model',
};

function track(event: string, ctx: TaskContext, props: object): void {
  try {
    destination.capture(event, {
      event_id: crypto.randomUUID(),
      schema_version: '0.1.0',
      timestamp: new Date().toISOString(),
      agent: AGENT,
      ...ctx,
      ...props,
    });
  } catch (err) {
    // Analytics must never break the agent loop.
    console.warn('[analytics] drop:', event, err);
  }
}

export const analytics = {
  taskStarted: (
    ctx: TaskContext,
    p: { initiator: 'human' | 'agent' | 'schedule' | 'api'; input_ref?: string },
  ) => track('task_started', ctx, p),

  taskCompleted: (
    ctx: TaskContext,
    p: {
      verification: 'verified' | 'self_reported';
      verifier?: string;
      duration_ms: number;
      steps_total: number;
      tokens_in_total?: number;
      tokens_out_total?: number;
      cost_usd?: number;
      output_ref?: string;
    },
  ) => track('task_completed', ctx, p),

  taskFailed: (
    ctx: TaskContext,
    p: {
      error: { type: string; message?: string };
      retryable: boolean;
      duration_ms: number;
      failed_step_id?: string;
    },
  ) => track('task_failed', ctx, p),

  taskAbandoned: (
    ctx: TaskContext,
    p: { abandoned_by: 'human' | 'timeout' | 'system'; reason?: string; duration_ms: number },
  ) => track('task_abandoned', ctx, p),

  stepExecuted: (
    ctx: TaskContext,
    p: {
      step_id: string;
      step_index: number;
      step_type: 'llm_call' | 'tool_call' | 'retrieval' | 'code_execution' | 'handoff' | 'other';
      tool_name?: string;
      model?: string;
      tokens_in?: number;
      tokens_out?: number;
      latency_ms: number;
      status: 'ok' | 'error' | 'timeout';
      error?: { type: string; message?: string };
      retry_of_step_id?: string;
    },
  ) => track('step_executed', ctx, p),

  handoffToHuman: (
    ctx: TaskContext,
    p: {
      handoff_id: string;
      reason: 'approval_required' | 'low_confidence' | 'error' | 'policy' | 'clarification' | 'user_request';
      blocking: boolean;
      context_ref?: string;
    },
  ) => track('handoff_to_human', ctx, p),

  humanApproved: (
    ctx: TaskContext,
    p: { handoff_id: string; response_latency_ms: number },
  ) => track('human_approved', ctx, p),

  humanEdited: (
    ctx: TaskContext,
    p: {
      handoff_id?: string;
      artifact_type: string;
      edit_magnitude?: { unit: 'chars' | 'tokens' | 'lines'; value: number };
    },
  ) => track('human_edited', ctx, p),

  humanOverrode: (
    ctx: TaskContext,
    p: { handoff_id?: string; takeover_step_id?: string; reason?: string },
  ) => track('human_overrode', ctx, p),

  feedbackGiven: (
    ctx: TaskContext,
    p: {
      rating: { kind: 'binary' | 'scale'; value: number };
      source: 'end_user' | 'operator';
      comment_ref?: string;
    },
  ) => track('feedback_given', ctx, p),
};
```

- [ ] **Step 5: Verify the skill dry-runs**

In a scratch session, invoke the skill against any small agentic repo
(or a toy Express app with one `anthropic.messages.create` call) and
confirm: it maps seams, produces a tracking plan matching Task 4's
format, and stops at the review gate without writing code.
Expected: tracking plan produced; no code written before approval.

- [ ] **Step 6: Commit**

```bash
git add skills/instrument-agentic-app
git commit -m "feat(skill): concierge instrumentation skill with templates"
```

---

### Task 7: Validation ops kit

**Files:**
- Create: `docs/validation/README.md`
- Create: `docs/validation/intake-template.md`
- Create: `docs/validation/weekly-report-template.md`
- Create: `docs/validation/question-log.md`
- Create: `docs/validation/scorecard.md`

**Interfaces:**
- Consumes: kill criteria and mechanics from the kickoff prompt; TOQAR metric names from Task 5.
- Produces: the operating documents for the 8-week test. `question-log.md` becomes the eval set for the future analysis agent; `weekly-report-template.md` becomes the v0 analysis toolbox.

- [ ] **Step 1: Write the validation README**

`docs/validation/README.md`:

```markdown
# Concierge Validation — Operations

8 weeks, 5 design partners (agentic startups, pre-seed–Series A, TS
stacks, live users, reachable founders). This test decides company vs.
consulting gig. Build no platform code while it runs.

## Cadence

- **Week 0** — intake call per partner: fill `intake-template.md`;
  capture their 3 unanswerable questions **verbatim**.
- **Week 1** — run the `instrument-agentic-app` skill against their
  repo; PR merged = A1 point. Data → their PostHog free tier or hosted
  ClickHouse.
- **Weeks 2–5** — every week, one insight report per partner via Slack,
  from `weekly-report-template.md`. **No scheduled discussion calls** —
  the signal is *inbound* questions. Log every question in
  `question-log.md` the day it arrives.
- **Week 6** — exit interview: Sean Ellis test ("how disappointed if you
  could no longer use this?") + a concrete willingness-to-pay number.

## Weekly ritual (30 min, same day each week)

1. Update `scorecard.md` counters.
2. Classify the week's questions (agent-shaped vs. classic).
3. File recurring schema patterns into the registry backlog.
4. Save every report's queries — they become the v0 analysis toolbox.
```

- [ ] **Step 2: Write the intake template**

`docs/validation/intake-template.md`:

```markdown
# Partner Intake — {{company}}

- Date: · Founder contact: · Slack channel:
- Product (one line): · Agent framework: · Repo:
- Stage: · Live users/accounts: · Current analytics:

## The three unanswerable questions (verbatim — do not paraphrase)

1.
2.
3.

## Task taxonomy draft

| task_type | Unit of value | Verified how? |
| --- | --- | --- |

## Destination

- [ ] Their PostHog (project key received)
- [ ] Hosted ClickHouse (endpoint provisioned)

## Access

- [ ] Repo access granted · - [ ] PR permission confirmed
```

- [ ] **Step 3: Write the weekly report template**

`docs/validation/weekly-report-template.md`:

```markdown
# {{company}} — Week {{n}} insights

**Headline:** {{one sentence — the single most decision-relevant finding}}

## TOQAR snapshot

| Metric | This week | Last week | Δ |
| --- | --- | --- | --- |
| Task Success Rate ({{top task_type}}) | | | |
| Cost per Completed Task | | | |
| Autonomy Rate | | | |
| Override/Takeover Rate | | | |
| Weekly Task Actors | | | |

## Finding of the week

{{2–4 sentences: what moved, the segment drill-down, the likely cause.
Every number traces to a saved query — link it.}}

## A question you can now answer

{{pick one of their three intake questions; show the answer + query}}

## Watching next week

{{one line}}

---
*Queries: {{link to saved queries — every number in this report is
reproducible; none are estimated or modeled}}*
```

- [ ] **Step 4: Write the question log and scorecard**

`docs/validation/question-log.md`:

```markdown
# Inbound Question Log

Log every partner question verbatim, same day. This file is scoring
input for A2/A3 **and** the future analysis agent's eval set.

| Date | Partner | Question (verbatim) | Prompted? | Shape | Answered via |
| --- | --- | --- | --- | --- | --- |
| 2026-07-14 | (example) acme | "why did cost per task double on tuesday" | unprompted | agent-shaped | step_executed cost segmentation |

- **Prompted?** unprompted = they came to us; prompted = reacting to a report.
- **Shape:** agent-shaped (task success, cost/task, tool failures,
  takeover…) vs. classic (funnels, retention, page analytics).
```

`docs/validation/scorecard.md`:

```markdown
# Validation Scorecard

Updated weekly. Statuses: 🟢 green · 🟡 watch · 🔴 kill-criterion hit.

| Signal | Threshold | Current | Status |
| --- | --- | --- | --- |
| A1 — PRs merged | red if ≤2/5 by week 2 | 0/5 | |
| A2 — partners with ≥2 unprompted questions | red if ≤1/5 by week 4 | 0/5 | |
| A3 — agent-shaped question share | pivot if <25% | –% | |
| WTP — partners naming ≥$200/mo | green if ≥2 | 0 | |

## Decision rules

- A1 red → the instrumentation wedge fails; stop, run the autopsy.
- A2 red → insights don't pull; company becomes consulting gig — decide.
- A3 <25% → keep the tech, pivot positioning to "better Mixpanel client".
- WTP green + A1/A2 not red → proceed to Phase 1 build order.

## Weekly history

| Week | A1 | A2 | A3 | Notes |
| --- | --- | --- | --- | --- |
```

- [ ] **Step 5: Commit**

```bash
git add docs/validation
git commit -m "docs(validation): concierge test ops kit — intake, reports, log, scorecard"
```

---

## Self-review results

- **Spec coverage:** brief §8 item 1 (monorepo) → Task 1 (registry package; `sdk-web`/`collector`/`analysis-primitives`/`mcp-server` deliberately deferred to Phase 1 per the validation gate — the kickoff prompt records this); item 2 (TOQAR typed schema) → Tasks 2–4; item 3 (concierge skill, top priority) → Task 6; item 4 (public schema README) → Task 5; §6 validation mechanics → Task 7.
- **Type consistency:** event names, property names, and enum values are identical across `events.ts` (Task 3), the README tables (Task 5), and the wrapper template (Task 6). `trackingPlanSchema` field names match the skill's Phase 2 instructions and the tracking-plan template sections.
- **Placeholder scan:** `{{...}}` tokens appear only inside document *templates* whose purpose is to be filled per-partner; all code steps contain complete code.

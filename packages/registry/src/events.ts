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

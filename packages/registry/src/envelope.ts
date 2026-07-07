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

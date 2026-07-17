import { z } from 'zod';

/**
 * Flat ClickHouse row (spec: analytics-storage). The fields the semantic
 * layer reads on the hot path are typed columns extracted here at
 * transform time — a metric read never parses JSON. `payload` keeps the
 * full event JSON for the long tail of properties.
 */
export interface EventRow {
  tenant_id: string;
  event: string;
  event_id: string;
  timestamp: string;
  task_id: string;
  run_id: string;
  session_id: string;
  task_type: string;
  agent_name: string;
  agent_version: string;
  tool_name: string;
  model: string;
  status: string;
  verification: string;
  initiator: string;
  retry_of_step_id: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_usd: number;
  rating_value: number;
  edit_magnitude_value: number;
  response_latency_ms: number;
  /** Full event JSON — event-specific properties live here. */
  payload: string;
}

const requiredShape = z.object({
  tenant_id: z.string().min(1),
  event: z.string().min(1),
  event_id: z.string().uuid(),
  timestamp: z.string().min(1),
  task_id: z.string().min(1),
  run_id: z.string().min(1),
  task_type: z.string().min(1),
  agent: z.object({ name: z.string().min(1), version: z.string().optional() }),
});

/** Missing/mistyped optionals coerce exactly like JSONExtract did: '' / 0. */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nested = (v: unknown, key: string): unknown =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;

/**
 * Enriched collector message → flat row. Returns null for unmappable
 * messages — the consumer counts those, never silently drops them.
 */
export function toRow(message: Record<string, unknown>): EventRow | null {
  const parsed = requiredShape.safeParse(message);
  if (!parsed.success) return null;
  const m = parsed.data;
  return {
    tenant_id: m.tenant_id,
    event: m.event,
    event_id: m.event_id,
    timestamp: m.timestamp,
    task_id: m.task_id,
    run_id: m.run_id,
    session_id: str(message.session_id),
    task_type: m.task_type,
    agent_name: m.agent.name,
    agent_version: m.agent.version ?? '',
    tool_name: str(message.tool_name),
    model: str(message.model),
    status: str(message.status),
    verification: str(message.verification),
    initiator: str(message.initiator),
    retry_of_step_id: str(message.retry_of_step_id),
    tokens_in: num(message.tokens_in),
    tokens_out: num(message.tokens_out),
    latency_ms: num(message.latency_ms),
    cost_usd: num(message.cost_usd),
    rating_value: num(nested(message.rating, 'value')),
    edit_magnitude_value: num(nested(message.edit_magnitude, 'value')),
    response_latency_ms: num(message.response_latency_ms),
    payload: JSON.stringify(message),
  };
}

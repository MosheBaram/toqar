import { z } from 'zod';

/** Flat ClickHouse row (change design D4: one wide events table). */
export interface EventRow {
  tenant_id: string;
  event: string;
  event_id: string;
  timestamp: string;
  task_id: string;
  run_id: string;
  task_type: string;
  agent_name: string;
  agent_version: string;
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
    task_type: m.task_type,
    agent_name: m.agent.name,
    agent_version: m.agent.version ?? '',
    payload: JSON.stringify(message),
  };
}

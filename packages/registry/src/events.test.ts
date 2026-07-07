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

import { describe, expect, it } from 'vitest';
import { toRow } from './transform.js';

function message(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 't_1',
    event: 'task_started',
    event_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    schema_version: '0.1.0',
    timestamp: '2026-07-09T17:00:00.000Z',
    task_id: 'task_1',
    run_id: 'run_1',
    task_type: 'reply_to_lead',
    agent: { name: 'sdr-agent', version: '1.4.2' },
    initiator: 'api',
    ...overrides,
  };
}

describe('toRow', () => {
  it('maps an enriched event to a flat row with the full payload preserved', () => {
    const row = toRow(message());
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      tenant_id: 't_1',
      event: 'task_started',
      event_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      timestamp: '2026-07-09T17:00:00.000Z',
      task_id: 'task_1',
      run_id: 'run_1',
      task_type: 'reply_to_lead',
      agent_name: 'sdr-agent',
      agent_version: '1.4.2',
    });
    expect(JSON.parse(row!.payload)).toMatchObject({ initiator: 'api' });
  });

  it('defaults missing optional agent version to empty string', () => {
    const row = toRow(message({ agent: { name: 'sdr-agent' } }));
    expect(row?.agent_version).toBe('');
  });

  it('returns null for a message missing required fields', () => {
    expect(toRow(message({ tenant_id: undefined }))).toBeNull();
    expect(toRow(message({ event_id: 'not-a-uuid' }))).toBeNull();
    expect(toRow('garbage' as unknown as Record<string, unknown>)).toBeNull();
  });

  // Typed hot columns (spec: analytics-storage): the fields the semantic
  // layer reads are extracted at transform time, never JSON-parsed on read.
  it('extracts step_executed hot fields into typed columns', () => {
    const row = toRow(
      message({
        event: 'step_executed',
        session_id: 's_9',
        tool_name: 'crm_lookup',
        model: 'claude-opus-4-8',
        status: 'error',
        retry_of_step_id: 'step_1',
        tokens_in: 812,
        tokens_out: 194,
        latency_ms: 1370,
      }),
    );
    expect(row).toMatchObject({
      session_id: 's_9',
      tool_name: 'crm_lookup',
      model: 'claude-opus-4-8',
      status: 'error',
      retry_of_step_id: 'step_1',
      tokens_in: 812,
      tokens_out: 194,
      latency_ms: 1370,
    });
  });

  it('extracts nested and event-specific hot fields', () => {
    const completed = toRow(
      message({ event: 'task_completed', verification: 'self_reported', cost_usd: 0.42 }),
    );
    expect(completed).toMatchObject({ verification: 'self_reported', cost_usd: 0.42 });

    const feedback = toRow(message({ event: 'feedback_given', rating: { kind: 'binary', value: 0 } }));
    expect(feedback?.rating_value).toBe(0);

    const edited = toRow(
      message({ event: 'human_edited', edit_magnitude: { unit: 'chars', value: 240 } }),
    );
    expect(edited?.edit_magnitude_value).toBe(240);

    const approved = toRow(message({ event: 'human_approved', response_latency_ms: 5400 }));
    expect(approved?.response_latency_ms).toBe(5400);
  });

  it('coerces missing/mistyped optionals exactly like JSONExtract: empty string and zero', () => {
    const row = toRow(message());
    expect(row).toMatchObject({
      session_id: '',
      tool_name: '',
      model: '',
      status: '',
      verification: '',
      retry_of_step_id: '',
      tokens_in: 0,
      tokens_out: 0,
      latency_ms: 0,
      cost_usd: 0,
      rating_value: 0,
      edit_magnitude_value: 0,
      response_latency_ms: 0,
    });
    // Mistyped values coerce, not crash — matching JSONExtract semantics.
    const weird = toRow(message({ tokens_in: 'lots', rating: 'five', tool_name: 7 }));
    expect(weird).toMatchObject({ tokens_in: 0, rating_value: 0, tool_name: '' });
  });
});

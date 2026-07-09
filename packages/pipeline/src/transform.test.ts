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
});

import { describe, expect, it } from 'vitest';
import { seamMapSchema } from './seam-map.js';

function validMap() {
  return {
    repo: 'acme/sdr-agent',
    frameworks: ['express', 'anthropic-sdk'],
    seams: [
      { kind: 'task_start', location: 'src/routes/leads.ts:24', note: 'POST /leads webhook' },
      { kind: 'llm_call', location: 'src/agent.ts:57' },
      { kind: 'tool_call', location: 'src/tools/crm.ts:12', note: 'crm_lookup' },
      { kind: 'outcome', location: 'src/agent.ts:88' },
      { kind: 'handoff', location: 'src/approval.ts:31' },
    ],
    task_taxonomy: ['reply_to_lead'],
    agent_version: 'instrumentation-agent@0.1.0',
    produced_at: '2026-07-09T10:00:00.000Z',
  };
}

describe('seamMapSchema', () => {
  it('accepts a complete seam map', () => {
    expect(seamMapSchema.safeParse(validMap()).success).toBe(true);
  });

  it('rejects an unknown seam kind', () => {
    const bad = validMap();
    bad.seams[0]!.kind = 'vibes';
    expect(seamMapSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an empty frameworks list', () => {
    const bad = { ...validMap(), frameworks: [] };
    expect(seamMapSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-ISO produced_at', () => {
    const bad = { ...validMap(), produced_at: 'yesterday' };
    expect(seamMapSchema.safeParse(bad).success).toBe(false);
  });
});

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

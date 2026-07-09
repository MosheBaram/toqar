import { SCHEMA_VERSION } from '@toqar/registry';
import { migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCollectorApp } from './app.js';
import { BufferedSink, type StreamSink } from './sink.js';

const db = await createPgliteExecutor();
let token: string;

/** Real in-memory sink with a failure toggle — behavior, not a mock of it. */
class MemorySink implements StreamSink {
  published: Record<string, unknown>[][] = [];
  failing = false;
  async publish(messages: Record<string, unknown>[]): Promise<void> {
    if (this.failing) throw new Error('broker unavailable');
    this.published.push(messages);
  }
}

const memory = new MemorySink();
const sink = new BufferedSink(memory, { capacity: 100 });
const app = buildCollectorApp(db, sink);
const authed = (t: string) => ({ authorization: `Bearer ${t}` });

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    timestamp: '2026-07-09T17:00:00.000Z',
    task_id: 'task_1',
    run_id: 'run_1',
    task_type: 'reply_to_lead',
    agent: { name: 'sdr-agent' },
    event: 'task_started',
    initiator: 'api',
    ...overrides,
  };
}

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  token = (await store.createTenant('Collector Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('auth', () => {
  it('rejects missing and unknown tokens', async () => {
    expect((await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [] } })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/events',
          headers: authed('tok_wrong'),
          payload: { events: [] },
        })
      ).statusCode,
    ).toBe(401);
  });
});

describe('mixed batch semantics', () => {
  it('accepts valid events, rejects invalid ones per-item with reasons', async () => {
    const events = [
      ...Array.from({ length: 4 }, () => event()),
      event({ event: 'task_completed', verification: 'probably_fine', duration_ms: 1, steps_total: 1 }),
      event({ event: 'meeting_booked', booked_via: 'calendar_link' }),
      event({ event: 'CamelCased' }),
    ];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: authed(token),
      payload: { events },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(5); // 4 core + 1 snake_case product event
    expect(body.rejected).toHaveLength(2);
    expect(body.rejected[0].index).toBe(4);
    expect(body.rejected[1].index).toBe(6);

    const delivered = memory.published.flat();
    expect(delivered).toHaveLength(5);
    expect(delivered.every((e) => e.tenant_id !== undefined)).toBe(true);
  });
});

describe('rejection counters', () => {
  it('exposes per-tenant counts by reason class', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/rejections', headers: authed(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(Object.keys(body.by_reason).sort()).toEqual(['invalid_event_name', 'schema_validation']);
  });
});

describe('broker blip', () => {
  it('keeps answering 202 while buffering, drains on recovery, health is truthful', async () => {
    memory.failing = true;
    const during = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: authed(token),
      payload: { events: [event()] },
    });
    expect(during.statusCode).toBe(202);
    expect(during.json().accepted).toBe(1);

    const degraded = await app.inject({ method: 'GET', url: '/health' });
    expect(degraded.json().broker).toBe('degraded');
    expect(degraded.json().buffered).toBeGreaterThan(0);

    memory.failing = false;
    const after = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: authed(token),
      payload: { events: [event()] },
    });
    expect(after.statusCode).toBe(202);

    const healthy = await app.inject({ method: 'GET', url: '/health' });
    expect(healthy.json().broker).toBe('up');
    expect(healthy.json().buffered).toBe(0);

    const delivered = memory.published.flat();
    expect(delivered.length).toBe(7); // 5 earlier + the buffered one + the recovery one
  });
});

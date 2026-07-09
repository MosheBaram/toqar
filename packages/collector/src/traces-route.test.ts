import { migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCollectorApp } from './app.js';
import { BufferedSink, type StreamSink } from './sink.js';

const db = await createPgliteExecutor();

class MemorySink implements StreamSink {
  published: Record<string, unknown>[][] = [];
  async publish(messages: Record<string, unknown>[]): Promise<void> {
    this.published.push(messages);
  }
}

const memory = new MemorySink();
const app = buildCollectorApp(db, new BufferedSink(memory, { capacity: 100 }));
let token: string;

const NS = 1_000_000_000n;
const otlpPayload = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'sdr-agent' } }] },
      scopeSpans: [
        {
          spans: [
            {
              traceId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
              spanId: '1112131415161718',
              parentSpanId: 'ffffffffffffffff',
              name: 'llm.call',
              startTimeUnixNano: String(1_752_000_000n * NS),
              endTimeUnixNano: String(1_752_000_002n * NS),
              attributes: [
                { key: 'gen_ai.request.model', value: { stringValue: 'claude-sonnet-5' } },
                { key: 'toqar.task_type', value: { stringValue: 'reply_to_lead' } },
              ],
              status: { code: 1 },
            },
            {
              traceId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
              spanId: '9998979695949392',
              parentSpanId: 'ffffffffffffffff',
              name: 'mystery.operation',
              startTimeUnixNano: String(1_752_000_000n * NS),
              endTimeUnixNano: String(1_752_000_001n * NS),
              attributes: [],
              status: { code: 1 },
            },
          ],
        },
      ],
    },
  ],
};

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('OTLP Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('POST /v1/traces', () => {
  it('requires auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/traces', payload: otlpPayload });
    expect(res.statusCode).toBe(401);
  });

  it('maps spans, enriches tenant, publishes, and counts unmapped', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      headers: { authorization: `Bearer ${token}` },
      payload: otlpPayload,
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ accepted: 1, unmapped: 1 });

    const delivered = memory.published.flat();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      event: 'step_executed',
      model: 'claude-sonnet-5',
      tenant_id: expect.stringMatching(/^t_/),
    });

    const counters = await app.inject({
      method: 'GET',
      url: '/v1/rejections',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(counters.json().by_reason.unmapped_span).toBe(1);
  });
});

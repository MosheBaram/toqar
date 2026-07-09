import { createServer, type Server } from 'node:http';
import { toqarEventSchema } from '@toqar/registry';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createToqarClient, type ToqarClientOptions } from './client.js';

interface ReceivedBatch {
  auth: string | undefined;
  events: Record<string, unknown>[];
}

let server: Server;
let endpoint: string;
let received: ReceivedBatch[] = [];
let respond: (events: unknown[]) => { status: number; body: unknown } = (events) => ({
  status: 202,
  body: { accepted: (events as unknown[]).length, rejected: [] },
});

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += String(c)));
    req.on('end', () => {
      const body = JSON.parse(raw) as { events: Record<string, unknown>[] };
      received.push({ auth: req.headers.authorization, events: body.events });
      const { status, body: resBody } = respond(body.events);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(resBody));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) throw new Error('no port');
  endpoint = `http://127.0.0.1:${addr.port}`;
});

afterEach(() => {
  received = [];
  respond = (events) => ({ status: 202, body: { accepted: (events as unknown[]).length, rejected: [] } });
  delete process.env.TOQAR_ANALYTICS_DISABLED;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const ctx = { task_id: 'task_1', run_id: 'run_1', task_type: 'reply_to_lead' };

function options(overrides: Partial<ToqarClientOptions> = {}): ToqarClientOptions {
  return {
    endpoint,
    token: 'tok_test',
    agent: { name: 'sdr-agent', version: '1.0.0' },
    flushIntervalMs: 60_000, // manual flush in tests
    ...overrides,
  };
}

describe('envelope completion', () => {
  it('emits schema-valid events with envelope fields filled in', async () => {
    const client = createToqarClient(options());
    client.analytics.taskStarted(ctx, { initiator: 'api' });
    await client.flush();
    await client.shutdown();

    expect(received).toHaveLength(1);
    const event = received[0]!.events[0]!;
    expect(received[0]!.auth).toBe('Bearer tok_test');
    expect(toqarEventSchema.safeParse(event).success).toBe(true);
    expect(String(event.event_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.schema_version).toBe('0.1.0');
    expect(typeof event.timestamp).toBe('string');
    expect(event.agent).toEqual({ name: 'sdr-agent', version: '1.0.0' });
  });
});

describe('dev-mode validation', () => {
  it('drops an invalid payload with a warning, never throwing', async () => {
    const warnings: string[] = [];
    const client = createToqarClient(options({ devValidate: true, onWarn: (m) => warnings.push(m) }));
    // @ts-expect-error — deliberately wrong enum to exercise dev validation
    client.analytics.taskCompleted(ctx, { verification: 'probably_fine', duration_ms: 1, steps_total: 1 });
    await client.flush();
    await client.shutdown();

    expect(received).toHaveLength(0);
    expect(warnings.some((w) => w.includes('task_completed'))).toBe(true);
  });
});

describe('kill switch', () => {
  it('makes every emitter a no-op with zero network', async () => {
    process.env.TOQAR_ANALYTICS_DISABLED = '1';
    const client = createToqarClient(options());
    client.analytics.taskStarted(ctx, { initiator: 'api' });
    await client.flush();
    await client.shutdown();
    expect(received).toHaveLength(0);
  });
});

describe('batching', () => {
  it('splits into batches of maxBatch', async () => {
    const client = createToqarClient(options({ maxBatch: 20 }));
    for (let i = 0; i < 25; i++) {
      client.analytics.stepExecuted(ctx, {
        step_id: `step_${i}`,
        step_index: i,
        step_type: 'tool_call',
        tool_name: 'crm_lookup',
        latency_ms: 5,
        status: 'ok',
      });
    }
    await client.flush();
    await client.shutdown();
    expect(received.map((b) => b.events.length)).toEqual([20, 5]);
  });
});

describe('failure behavior', () => {
  it('drops after bounded retries with a warning; caller is never blocked or thrown at', async () => {
    const warnings: string[] = [];
    const client = createToqarClient(
      options({ endpoint: 'http://127.0.0.1:1', maxRetries: 1, onWarn: (m) => warnings.push(m) }),
    );
    client.analytics.taskStarted(ctx, { initiator: 'api' });
    await client.flush();
    await client.shutdown();
    expect(warnings.some((w) => w.includes('drop'))).toBe(true);
  });

  it('surfaces per-item rejections from the collector as warnings', async () => {
    respond = () => ({ status: 202, body: { accepted: 0, rejected: [{ index: 0, reasons: ['bad enum'] }] } });
    const warnings: string[] = [];
    const client = createToqarClient(options({ onWarn: (m) => warnings.push(m) }));
    client.analytics.taskStarted(ctx, { initiator: 'api' });
    await client.flush();
    await client.shutdown();
    expect(warnings.some((w) => w.includes('rejected'))).toBe(true);
  });
});

import { SCHEMA_VERSION } from '@toqar/registry';
import { BufferedSink, buildCollectorApp } from '@toqar/collector';
import { migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClickHouse, ensureSchema } from './clickhouse.js';
import { createRedpandaSink, startEventsConsumer, type ConsumerHandle } from './redpanda.js';

/**
 * Real-pipe verification (spec: stream-pipeline): collector → Redpanda →
 * ClickHouse from infra/docker-compose.yml. Gated: set TOQAR_INTEGRATION=1
 * with the compose stack up (CI: .github/workflows/integration.yml).
 */
const RUN = process.env.TOQAR_INTEGRATION === '1';
const BROKERS = ['127.0.0.1:9092'];
const CLICKHOUSE_URL = 'http://toqar:toqar_dev@127.0.0.1:8123';

const suite = describe.skipIf(!RUN);

let db: Awaited<ReturnType<typeof createPgliteExecutor>>;
let app: ReturnType<typeof buildCollectorApp>;
let token: string;
let tenantId: string;
let consumer: ConsumerHandle;
let redpandaSink: ReturnType<typeof createRedpandaSink>;
const ch = createClickHouse(CLICKHOUSE_URL);

function event(): Record<string, unknown> {
  return {
    event_id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    task_id: 'task_int',
    run_id: 'run_int',
    task_type: 'reply_to_lead',
    agent: { name: 'sdr-agent', version: '1.0.0' },
    event: 'task_started',
    initiator: 'api',
  };
}

async function countRows(): Promise<number> {
  const result = await ch.query({
    query: `SELECT count() AS c FROM toqar.events FINAL WHERE tenant_id = '${tenantId}'`,
    format: 'JSONEachRow',
  });
  const rows = (await result.json()) as { c: string }[];
  return Number(rows[0]?.c ?? 0);
}

suite('collector → Redpanda → ClickHouse', () => {
  beforeAll(async () => {
    db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    const store = new RegistryStore(db);
    const t = await store.createTenant('Pipeline Integration Tenant');
    token = t.token;
    tenantId = t.tenantId;

    await ensureSchema(ch);
    redpandaSink = createRedpandaSink(BROKERS);
    app = buildCollectorApp(db, new BufferedSink(redpandaSink, { capacity: 1000 }));
    consumer = await startEventsConsumer({ brokers: BROKERS, clickhouse: ch, groupId: `it_${Date.now()}` });
  });

  afterAll(async () => {
    await consumer?.stop();
    await redpandaSink?.close();
    await app?.close();
    await db?.close();
    await ch.close();
  });

  it('events land queryable within 10 seconds', async () => {
    const start = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { events: [event(), event(), event()] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().accepted).toBe(3);

    while ((await countRows()) < 3) {
      if (Date.now() - start > 10_000) throw new Error('freshness budget exceeded (10s)');
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it('redelivered batches do not duplicate rows (event_id idempotency)', async () => {
    const before = await countRows();
    const duplicated = event();
    await redpandaSink.publish([
      { ...duplicated, tenant_id: tenantId },
    ]);
    await redpandaSink.publish([
      { ...duplicated, tenant_id: tenantId },
    ]);

    const deadline = Date.now() + 10_000;
    while ((await countRows()) < before + 1) {
      if (Date.now() > deadline) throw new Error('row never arrived');
      await new Promise((r) => setTimeout(r, 250));
    }
    // allow merges/dedup to settle, then assert FINAL sees exactly one
    await new Promise((r) => setTimeout(r, 1500));
    expect(await countRows()).toBe(before + 1);
  });

  it('vanilla OTLP export lands as step_executed rows, deduped on resend', async () => {
    const NS = 1_000_000_000n;
    const payload = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'sdr-agent' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
                  spanId: '0102030405060708',
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
              ],
            },
          ],
        },
      ],
    };

    const send = () =>
      app.inject({
        method: 'POST',
        url: '/v1/traces',
        headers: { authorization: `Bearer ${token}` },
        payload,
      });
    const first = await send();
    expect(first.statusCode).toBe(202);
    expect(first.json().accepted).toBe(1);
    await send(); // OTLP retry — deterministic event_id must dedupe

    const query = async () => {
      const result = await ch.query({
        query: `SELECT count() AS c FROM toqar.events FINAL WHERE tenant_id = '${tenantId}' AND event = 'step_executed' AND agent_name = 'sdr-agent'`,
        format: 'JSONEachRow',
      });
      return Number(((await result.json()) as { c: string }[])[0]?.c ?? 0);
    };

    const deadline = Date.now() + 10_000;
    while ((await query()) < 1) {
      if (Date.now() > deadline) throw new Error('OTLP-mapped row never arrived');
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 1500));
    expect(await query()).toBe(1);
  });
});

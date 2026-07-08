import { SCHEMA_VERSION } from '@toqar/registry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let tokenA: string;
let tokenB: string;

function entry(event: string) {
  return {
    event,
    description: 'Product-specific event.',
    journey: 'lead_outreach',
    owner_metric: 'verified_success_rate',
    status: 'active',
    since_version: SCHEMA_VERSION,
  };
}

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  tokenA = (await store.createTenant('Tenant A')).token;
  tokenB = (await store.createTenant('Tenant B')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

const authed = (token: string) => ({ authorization: `Bearer ${token}` });

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/registry/events' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/registry/events',
      headers: authed('tok_unknown'),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('registry routes', () => {
  it('lists the seeded registry with a fingerprint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/registry/events',
      headers: authed(tokenA),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toHaveLength(10);
    expect(body.fingerprint).toMatch(/^fp_/);
  });

  it('gets one event and 404s a missing one', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/v1/registry/events/task_completed',
      headers: authed(tokenA),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().event).toBe('task_completed');

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/registry/events/nope',
      headers: authed(tokenA),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('puts a valid entry and rejects an invalid one with issues', async () => {
    const ok = await app.inject({
      method: 'PUT',
      url: '/v1/registry/events/reply_received',
      headers: authed(tokenA),
      payload: entry('reply_received'),
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'PUT',
      url: '/v1/registry/events/bad_event',
      headers: authed(tokenA),
      payload: { ...entry('bad_event'), owner_metric: '' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues).toBeDefined();
  });

  it('rejects a body whose event does not match the route', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/registry/events/one_name',
      headers: authed(tokenA),
      payload: entry('other_name'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('applies a plan with a fresh fingerprint and 409s a stale one', async () => {
    const { fingerprint } = (
      await app.inject({ method: 'GET', url: '/v1/registry/events', headers: authed(tokenA) })
    ).json();

    const plan = {
      repo: 'a/b',
      generated_at: '2026-07-08T10:00:00.000Z',
      summary: 'add one',
      added: [
        { ...entry('meeting_booked'), status: 'proposed', code_locations: ['src/x.ts:1'], implementation_notes: 'emit on booking' },
      ],
      modified: [],
      removed: [],
    };

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/registry/apply',
      headers: authed(tokenA),
      payload: { plan, fingerprint },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ added: 1, modified: 0, removed: 0 });

    const stale = await app.inject({
      method: 'POST',
      url: '/v1/registry/apply',
      headers: authed(tokenA),
      payload: { plan, fingerprint },
    });
    expect(stale.statusCode).toBe(409);
  });

  it('lists the audit trail newest-first', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/registry/audit',
      headers: authed(tokenA),
    });
    expect(res.statusCode).toBe(200);
    const records = res.json().records;
    expect(records[0].operation).toBe('add');
    expect(records[0].event).toBe('meeting_booked');
  });
});

describe('tenant isolation', () => {
  it("tenant B's token never sees tenant A's data on any read route", async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/v1/registry/events',
      headers: authed(tokenB),
    });
    const events = list.json().entries.map((e: { event: string }) => e.event);
    expect(events).not.toContain('meeting_booked');
    expect(events).not.toContain('reply_received');

    const single = await app.inject({
      method: 'GET',
      url: '/v1/registry/events/meeting_booked',
      headers: authed(tokenB),
    });
    expect(single.statusCode).toBe(404);

    const audit = await app.inject({
      method: 'GET',
      url: '/v1/registry/audit',
      headers: authed(tokenB),
    });
    expect(audit.json().records.every((r: { operation: string }) => r.operation === 'seed')).toBe(true);
  });
});

describe('health', () => {
  it('reports ok while the database is reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports degraded truthfully when the database is down', async () => {
    const deadDb = await createPgliteExecutor();
    const deadApp = buildApp(deadDb);
    await deadDb.close();
    const res = await deadApp.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().database).toBe('down');
    await deadApp.close();
  });
});

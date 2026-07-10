import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
const store = new RegistryStore(db);
let token: string;
let tenantId: string;
let otherId: string;
const authed = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const a = await store.createTenant('Benchmark Tenant A');
  token = a.token;
  tenantId = a.tenantId;
  otherId = (await store.createTenant('Benchmark Tenant B')).tenantId;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('benchmark opt-in', () => {
  it('defaults to opted-out', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/benchmark/optin', headers: authed(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().opted_in).toBe(false);
  });

  it('records opt-in and opt-out with an audit trail', async () => {
    const optIn = await app.inject({
      method: 'PUT',
      url: '/v1/benchmark/optin',
      headers: authed(token),
      payload: { opted_in: true },
    });
    expect(optIn.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/benchmark/optin', headers: authed(token) })).json().opted_in).toBe(true);

    const audit = await app.inject({ method: 'GET', url: '/v1/registry/audit', headers: authed(token) });
    expect((audit.json().records as { operation: string }[]).some((r) => r.operation === 'benchmark')).toBe(true);

    await app.inject({ method: 'PUT', url: '/v1/benchmark/optin', headers: authed(token), payload: { opted_in: false } });
    expect((await app.inject({ method: 'GET', url: '/v1/benchmark/optin', headers: authed(token) })).json().opted_in).toBe(false);
  });

  it('opted-in tenant list contains only opted-in tenants', async () => {
    await store.setBenchmarkOptin(tenantId, { opted_in: true }, 'test');
    await store.setBenchmarkOptin(otherId, { opted_in: false }, 'test');
    const optedIn = await store.optedInTenants();
    expect(optedIn).toContain(tenantId);
    expect(optedIn).not.toContain(otherId);
  });
});

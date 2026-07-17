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

describe('benchmark viewing gate (go-to-market §8.2, founder decision #5)', () => {
  // A second app with a fixture cohort source: 6 opted-in tenants clear
  // DEFAULT_K, our tenant contributes 0.62.
  const source = async (_metric: string, tenantIds: string[]) =>
    tenantIds.map((id, i) => ({ tenantId: id, value: id === gatedId ? 0.62 : 0.5 + i * 0.05 }));
  let gatedApp: ReturnType<typeof buildApp>;
  let gatedToken: string;
  let gatedId: string;

  beforeAll(async () => {
    gatedApp = buildApp(db, { benchmarkSource: source });
    const t = await store.createTenant('Gated Tenant');
    gatedToken = t.token;
    gatedId = t.tenantId;
    // 5 more opted-in contributors so the cohort clears k
    for (let i = 0; i < 5; i++) {
      const c = await store.createTenant(`Cohort ${i}`);
      await store.setBenchmarkOptin(c.tenantId, { opted_in: true }, 'test');
    }
  });

  afterAll(async () => {
    await gatedApp.close();
  });

  const get = (metric = 'task_success_rate') =>
    gatedApp.inject({ method: 'GET', url: `/v1/benchmark/result?metric=${metric}`, headers: authed(gatedToken) });

  it('free tier is refused with the honest gate name', async () => {
    const res = await get();
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'benchmark_requires_growth', tier: 'free' });
  });

  it('growth without contribution is refused: see only if you contribute', async () => {
    await store.setBilling(gatedId, { tier: 'growth' });
    const res = await get();
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('benchmark_requires_optin');
  });

  it('growth + opted-in sees the k-anonymized cohort with own percentile', async () => {
    await store.setBenchmarkOptin(gatedId, { opted_in: true }, 'test');
    const res = await get();
    expect(res.statusCode).toBe(200);
    const { metric, result } = res.json();
    expect(metric).toBe('task_success_rate');
    expect(result.suppressed).toBe(false);
    expect(result.distribution.count).toBeGreaterThanOrEqual(6); // >= k; sibling tests may add opted-in tenants
    expect(result.own_percentile).toBeGreaterThanOrEqual(1);
  });

  it('unknown metrics 400 with the benchmarked list; no source wired is an honest 503', async () => {
    expect((await get('vibes')).statusCode).toBe(400);
    // the module-level app has no benchmarkSource
    await store.setBilling(tenantId, { tier: 'growth' });
    await store.setBenchmarkOptin(tenantId, { opted_in: true }, 'test');
    const bare = await app.inject({ method: 'GET', url: '/v1/benchmark/result?metric=task_success_rate', headers: authed(token) });
    expect(bare.statusCode).toBe(503);
    expect(bare.json().error).toBe('benchmark_source_unavailable');
  });
});


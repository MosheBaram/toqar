import type { SeamMap } from '@toqar/registry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore, ValidationError } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
const store = new RegistryStore(db);
let tokenA: string;
let tenantA: string;
let tokenB: string;

function seamMap(overrides: Partial<SeamMap> = {}): SeamMap {
  return {
    repo: 'acme/sdr-agent',
    frameworks: ['express', 'anthropic-sdk'],
    seams: [
      { kind: 'task_start', location: 'src/routes/leads.ts:24', note: 'POST /leads webhook' },
      { kind: 'llm_call', location: 'src/agent.ts:57' },
    ],
    task_taxonomy: ['reply_to_lead'],
    agent_version: 'instrumentation-agent@0.1.0',
    produced_at: '2026-07-09T10:00:00.000Z',
    ...overrides,
  };
}

const authed = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const a = await store.createTenant('Tenant A');
  tenantA = a.tenantId;
  tokenA = a.token;
  tokenB = (await store.createTenant('Tenant B')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('RegistryStore seam maps', () => {
  it('round-trips a seam map and returns the latest on re-put', async () => {
    await store.putSeamMap(tenantA, seamMap(), 'agent');
    await store.putSeamMap(
      tenantA,
      seamMap({ produced_at: '2026-07-09T11:00:00.000Z', task_taxonomy: ['reply_to_lead', 'qualify_inbound'] }),
      'agent',
    );
    const back = await store.getSeamMap(tenantA, 'acme/sdr-agent');
    expect(back?.task_taxonomy).toEqual(['reply_to_lead', 'qualify_inbound']);
    expect(back?.produced_at).toBe('2026-07-09T11:00:00.000Z');
  });

  it('rejects an invalid map before storage', async () => {
    await expect(
      store.putSeamMap(tenantA, { repo: 'x/y', frameworks: [] }, 'agent'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await store.getSeamMap(tenantA, 'x/y')).toBeNull();
  });

  it('appends seam-map writes AND reads to the audit trail (source context tier)', async () => {
    const records = await store.listAudit(tenantA);
    const seamOps = records.filter((r) => r.operation === 'seam_map');
    // Two writes from the earlier tests, plus one audited READ — source
    // context is the most restricted classification tier, so access is
    // recorded, not just mutation (spec: security-controls).
    const reads = seamOps.filter((r) => (r.diff.after as { action?: string })?.action === 'read');
    expect(reads.length).toBeGreaterThanOrEqual(1);
    expect(seamOps.length - reads.length).toBe(2);
    expect(seamOps.some((r) => r.event === 'acme/sdr-agent')).toBe(true);
  });
});

describe('seam-map routes', () => {
  it('PUT then GET returns the map', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/v1/registry/seam-map',
      headers: authed(tokenA),
      payload: seamMap({ repo: 'acme/web' }),
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: 'GET',
      url: `/v1/registry/seam-map?repo=${encodeURIComponent('acme/web')}`,
      headers: authed(tokenA),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().repo).toBe('acme/web');
  });

  it('404s an unknown repo and isolates tenants', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: `/v1/registry/seam-map?repo=${encodeURIComponent('acme/none')}`,
      headers: authed(tokenA),
    });
    expect(missing.statusCode).toBe(404);

    const crossTenant = await app.inject({
      method: 'GET',
      url: `/v1/registry/seam-map?repo=${encodeURIComponent('acme/sdr-agent')}`,
      headers: authed(tokenB),
    });
    expect(crossTenant.statusCode).toBe(404);
  });
});

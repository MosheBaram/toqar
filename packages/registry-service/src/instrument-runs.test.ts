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

const authed = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await store.createTenant('Runs Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('instrument run records', () => {
  let runId: string;

  it('records a delivered run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/registry/instrument-runs',
      headers: authed(token),
      payload: {
        repo: 'acme/sdr-agent',
        pr_url: 'https://github.com/acme/sdr-agent/pull/7',
        tokens_in: 1200,
        tokens_out: 300,
        cost_usd: 0.0081,
        model: 'claude-sonnet-5',
        agent_version: 'instrumentation-agent@0.1.0',
      },
    });
    expect(res.statusCode).toBe(200);
    runId = res.json().run_id;
    expect(runId).toMatch(/^run_/);
  });

  it('updates the outcome and computes merge rate from records', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/registry/instrument-runs/${runId}`,
      headers: authed(token),
      payload: { outcome: 'merged' },
    });
    expect(patch.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/registry/instrument-runs',
      headers: authed(token),
    });
    const body = list.json();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].outcome).toBe('merged');
    expect(body.merge_rate).toEqual({ merged: 1, delivered: 1 });
  });

  it('rejects an unknown outcome and an unknown run', async () => {
    const bad = await app.inject({
      method: 'PATCH',
      url: `/v1/registry/instrument-runs/${runId}`,
      headers: authed(token),
      payload: { outcome: 'vibes' },
    });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/v1/registry/instrument-runs/run_nope',
      headers: authed(token),
      payload: { outcome: 'rejected' },
    });
    expect(missing.statusCode).toBe(404);
  });
});

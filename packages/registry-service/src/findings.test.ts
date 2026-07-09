import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let token: string;
const authed = () => ({ authorization: `Bearer ${token}` });

function finding(overrides: Record<string, unknown> = {}) {
  return {
    layer: 'T',
    severity: 'critical',
    variant: 'regression',
    headline: 'Task success dropped to 62.0% after the v42 bump.',
    summary: 'The drop concentrates at crm_lookup.',
    metrics: [{ label: 'task_success_rate', value: '62.0%', query_id: 'q_1111111111111111' }],
    evidence: [{ title: 'Compare TSR across versions', query_id: 'q_1111111111111111' }],
    prompt_version: 'playbooks@0.1.0',
    model: 'claude-sonnet-5',
    ...overrides,
  };
}

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('Findings Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('findings lifecycle', () => {
  let findingId: string;

  it('publishes a valid finding and lists it newest-first', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/findings',
      headers: authed(),
      payload: finding(),
    });
    expect(res.statusCode).toBe(200);
    findingId = res.json().finding_id;
    expect(findingId).toMatch(/^f_/);

    const list = await app.inject({ method: 'GET', url: '/v1/findings', headers: authed() });
    expect(list.json().findings).toHaveLength(1);
    expect(list.json().findings[0].headline).toContain('62.0%');
  });

  it('rejects an uncited number, records it in the regression log, publishes nothing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/findings',
      headers: authed(),
      payload: finding({ summary: 'Cost rose to $0.55 per task.' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().uncited).toContain('$0.55');

    const list = await app.inject({ method: 'GET', url: '/v1/findings', headers: authed() });
    expect(list.json().findings).toHaveLength(1);

    const rejections = await app.inject({
      method: 'GET',
      url: '/v1/finding-rejections',
      headers: authed(),
    });
    expect(rejections.json().rejections).toHaveLength(1);
    expect(rejections.json().rejections[0].reason).toContain('$0.55');
  });

  it('records delivery attempts per finding', async () => {
    const delivered = await app.inject({
      method: 'POST',
      url: `/v1/findings/${findingId}/deliveries`,
      headers: authed(),
      payload: { channel: 'slack', status: 'failed', detail: 'webhook 500' },
    });
    expect(delivered.statusCode).toBe(200);

    const get = await app.inject({
      method: 'GET',
      url: `/v1/findings/${findingId}`,
      headers: authed(),
    });
    expect(get.json().deliveries).toHaveLength(1);
    expect(get.json().deliveries[0].status).toBe('failed');
  });

  it('404s an unknown finding', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/findings/f_nope', headers: authed() });
    expect(res.statusCode).toBe(404);
  });
});

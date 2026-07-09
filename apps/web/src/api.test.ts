import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantApi, type TenantApi } from './api.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let api: TenantApi;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  const { token, tenantId } = await store.createTenant('Web Tenant');
  await store.publishFinding(
    tenantId,
    {
      layer: 'T',
      severity: 'critical',
      variant: 'regression',
      headline: 'Task success moved -9.2 pts across the pivot — now at 62.0%.',
      summary: 'The shift concentrates at crm_lookup.',
      metrics: [
        { label: 'task_success_rate', value: '62.0%', query_id: 'q_1111111111111111' },
        { label: 'regression_delta', value: '-9.2 pts', query_id: 'q_2222222222222222' },
      ],
      evidence: [{ title: 'TSR over the window', query_id: 'q_1111111111111111' }],
    },
    'test',
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  api = createTenantApi(`http://127.0.0.1:${address.port}`, token);
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('web api client against the real service', () => {
  it('lists findings the feed can render', async () => {
    const findings = await api.listFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ layer: 'T', severity: 'critical' });
    expect(findings[0]!.metrics[0]!.query_id).toMatch(/^q_/);
  });

  it('reads the registry for the browser page', async () => {
    const entries = await api.getRegistry();
    expect(entries.length).toBe(10);
    expect(entries.every((e) => e.owner_metric.length > 0)).toBe(true);
  });

  it('round-trips an autonomy grant', async () => {
    expect((await api.getAutonomy()).level).toBe(0);
    await api.grantAutonomy(1, 'web-test');
    const after = await api.getAutonomy();
    expect(after.level).toBe(1);
    expect(after.history[0]).toMatchObject({ granted_by: 'web-test' });
  });
});

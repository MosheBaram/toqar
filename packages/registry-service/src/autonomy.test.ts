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

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('Autonomy Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('autonomy dial backend', () => {
  it('defaults to level 0 (read-only analysis)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/autonomy', headers: authed() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ level: 0, history: [] });
  });

  it('records a grant with actor and shows it in history and audit', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/v1/autonomy',
      headers: authed(),
      payload: { level: 1, granted_by: 'm.baram' },
    });
    expect(put.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/v1/autonomy', headers: authed() });
    expect(res.json().level).toBe(1);
    expect(res.json().history[0]).toMatchObject({ level: 1, granted_by: 'm.baram' });

    const audit = await app.inject({ method: 'GET', url: '/v1/registry/audit', headers: authed() });
    expect(audit.json().records[0].operation).toBe('autonomy');
  });

  it('rejects an invalid level', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/autonomy',
      headers: authed(),
      payload: { level: 7, granted_by: 'm.baram' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('autonomy level 3 + rollout policy (spec: autonomous-rollout)', () => {
  it('level 3 is grantable, audited, and revocable like every rung', async () => {
    const db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    const store = new RegistryStore(db);
    const { tenantId } = await store.createTenant('L3 Tenant');
    await store.grantAutonomy(tenantId, { level: 3, granted_by: 'founder' }, 'test');
    expect((await store.getAutonomy(tenantId)).level).toBe(3);
    // Revocation = granting a lower level; the dial is append-only history.
    await store.grantAutonomy(tenantId, { level: 1, granted_by: 'founder' }, 'test');
    expect((await store.getAutonomy(tenantId)).level).toBe(1);
    await expect(store.grantAutonomy(tenantId, { level: 4, granted_by: 'x' }, 'test')).rejects.toThrow();
    await db.close();
  });

  it('the blast-radius policy round-trips, validated and audited', async () => {
    const db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    const store = new RegistryStore(db);
    const { tenantId } = await store.createTenant('Policy Tenant');
    expect(await store.getRolloutPolicy(tenantId)).toBeNull();
    const policy = { change_classes: ['flag_rollout'], max_traffic_share: 0.1, protected_task_types: ['payments'], max_concurrent: 2 };
    await store.setRolloutPolicy(tenantId, policy, 'founder');
    expect(await store.getRolloutPolicy(tenantId)).toEqual(policy);
    await expect(store.setRolloutPolicy(tenantId, { ...policy, max_traffic_share: 2 }, 'x')).rejects.toThrow();
    const audit = await store.listAudit(tenantId);
    expect(audit.some((a) => a.event === 'rollout_policy')).toBe(true);
    await db.close();
  });
});


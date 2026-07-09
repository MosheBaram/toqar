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

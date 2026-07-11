import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { OperatorStore } from './operator.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);

let operatorToken: string;
let tenantFull: string; // api:full
let tenantEvents: string; // events:write
let acmeId: string;

const OPERATOR_ROUTES = [
  { method: 'GET' as const, url: () => '/operator/tenants' },
  { method: 'GET' as const, url: () => `/operator/tenants/${acmeId}` },
  { method: 'GET' as const, url: () => '/operator/rollups' },
  { method: 'GET' as const, url: () => '/operator/health' },
];

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  const ops = new OperatorStore(db);
  const acme = await store.createTenant('Acme');
  acmeId = acme.tenantId;
  tenantFull = acme.token;
  tenantEvents = (await store.issueToken(acme.tenantId, { scope: 'events:write' }, 'test')).token;
  operatorToken = (await ops.createOperatorToken('alice@toqar')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('operator API access control', () => {
  it('an operator token reaches every operator route (200)', async () => {
    for (const route of OPERATOR_ROUTES) {
      const res = await app.inject({ method: route.method, url: route.url(), headers: bearer(operatorToken) });
      expect(res.statusCode, `${route.url()} with operator token`).toBe(200);
    }
  });

  it('a tenant token — any scope — is refused with 403 on every operator route', async () => {
    for (const token of [tenantFull, tenantEvents]) {
      for (const route of OPERATOR_ROUTES) {
        const res = await app.inject({ method: route.method, url: route.url(), headers: bearer(token) });
        expect(res.statusCode, `${route.url()} with tenant token`).toBe(403);
        expect(res.json().required).toBe('operator');
      }
    }
  });

  it('no token and unknown/revoked tokens are 401 on operator routes', async () => {
    for (const route of OPERATOR_ROUTES) {
      const none = await app.inject({ method: route.method, url: route.url() });
      expect(none.statusCode, `${route.url()} no token`).toBe(401);
      const unknown = await app.inject({ method: route.method, url: route.url(), headers: bearer('optok_nope') });
      expect(unknown.statusCode, `${route.url()} unknown token`).toBe(401);
    }
  });
});

describe('operator API responses', () => {
  it('lists tenants with summary state', async () => {
    const res = await app.inject({ method: 'GET', url: '/operator/tenants', headers: bearer(operatorToken) });
    const body = res.json();
    expect(body.tenants.some((t: { name: string }) => t.name === 'Acme')).toBe(true);
  });

  it('drills into a tenant and 404s an unknown one', async () => {
    const ok = await app.inject({ method: 'GET', url: `/operator/tenants/${acmeId}`, headers: bearer(operatorToken) });
    expect(ok.json().name).toBe('Acme');
    const missing = await app.inject({ method: 'GET', url: '/operator/tenants/t_missing', headers: bearer(operatorToken) });
    expect(missing.statusCode).toBe(404);
  });

  it('health reflects the reachable database truthfully', async () => {
    const res = await app.inject({ method: 'GET', url: '/operator/health', headers: bearer(operatorToken) });
    expect(res.json()).toMatchObject({ status: 'ok', database: 'up' });
  });
});

import { buildApp, migrate, MIGRATIONS, OperatorStore, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOperatorApi, type OperatorApi } from './api.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let api: OperatorApi;
let tenantToken: string;
let baseUrl: string;
let acmeId: string;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  const ops = new OperatorStore(db);
  const acme = await store.createTenant('Acme');
  acmeId = acme.tenantId;
  tenantToken = acme.token;
  await store.createTenant('Globex');
  const r = await store.recordInstrumentRun(acme.tenantId, { repo: 'acme/app', agent_version: 'a@1' }, 'test');
  await store.updateRunOutcome(acme.tenantId, r.run_id, 'merged', 'test');

  const operatorToken = (await ops.createOperatorToken('alice@toqar')).token;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}`;
  api = createOperatorApi(baseUrl, operatorToken);
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('operator api client against the real service', () => {
  it('lists tenants with summary state', async () => {
    const tenants = await api.listTenants();
    expect(tenants.map((t) => t.name).sort()).toEqual(['Acme', 'Globex']);
  });

  it('drills into a tenant and returns null for an unknown one', async () => {
    const snap = await api.getTenant(acmeId);
    expect(snap!.name).toBe('Acme');
    expect(snap!.instrument_runs.merge_rate).toEqual({ merged: 1, delivered: 1 });
    expect(await api.getTenant('t_missing')).toBeNull();
  });

  it('reads rollups that reconcile to records', async () => {
    const roll = await api.getRollups();
    expect(roll.tenants).toBe(2);
    expect(roll.merge_rate).toEqual({ merged: 1, delivered: 1 });
  });

  it('reads truthful health', async () => {
    expect(await api.getHealth()).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('a tenant token cannot use the operator api', async () => {
    const asTenant = createOperatorApi(baseUrl, tenantToken);
    await expect(asTenant.listTenants()).rejects.toThrow(/403/);
  });
});

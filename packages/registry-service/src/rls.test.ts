import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const store = new RegistryStore(db);
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  tenantA = (await store.createTenant('RLS Tenant A')).tenantId;
  tenantB = (await store.createTenant('RLS Tenant B')).tenantId;
});

afterAll(async () => {
  await db.close();
});

describe('row-level security beneath application checks (design D1)', () => {
  it('an unscoped query inside tenant A context returns only tenant A rows', async () => {
    // The application-bug scenario: WHERE clause forgot the tenant filter.
    const rows = await db.tenantTransaction(tenantA, async (tx) => {
      const result = await tx.query('SELECT tenant_id FROM registry_entries', []);
      return result.rows;
    });
    expect(rows.length).toBe(10); // only A's seeded taxonomy, not 20
    expect(rows.every((r) => r.tenant_id === tenantA)).toBe(true);
  });

  it('cross-tenant reads return nothing even when explicitly requested', async () => {
    const rows = await db.tenantTransaction(tenantA, async (tx) => {
      const result = await tx.query(
        'SELECT tenant_id FROM registry_entries WHERE tenant_id = $1',
        [tenantB],
      );
      return result.rows;
    });
    expect(rows).toEqual([]);
  });

  it('cross-tenant writes are rejected by policy', async () => {
    await expect(
      db.tenantTransaction(tenantA, async (tx) => {
        await tx.query(
          `INSERT INTO registry_entries (tenant_id, event, entry) VALUES ($1, 'sneaky_event', '{}')`,
          [tenantB],
        );
      }),
    ).rejects.toThrow();
  });

  it('audit rows are tenant-invisible across the boundary too', async () => {
    const rows = await db.tenantTransaction(tenantB, async (tx) => {
      const result = await tx.query('SELECT DISTINCT tenant_id FROM audit_log', []);
      return result.rows;
    });
    expect(rows).toEqual([{ tenant_id: tenantB }]);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { createPgliteExecutor } from './db/pglite.js';
import { migrate } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { RegistryStore } from './store.js';
import type { QueryResult, SqlExecutor, SqlRunner } from './db/executor.js';

/**
 * Proves the tenancy delta (spec: tenancy — "Served path runs under the
 * RLS-bound session"): the store's OWN methods run inside
 * tenantTransaction, so row-level security applies to the served path,
 * not only to a dedicated harness. The wrapper below intercepts the
 * store's transactions and, inside each one, runs a deliberately
 * UNSCOPED query — simulating the application bug RLS exists to contain.
 */

interface Probe {
  tenantTransactions: number;
  /** Rows an unscoped `SELECT tenant_id FROM findings` sees inside the store's own tx. */
  leakedTenants: Set<string>;
}

function probedExecutor(inner: SqlExecutor, probe: Probe): SqlExecutor {
  return {
    query: (text, params) => inner.query(text, params),
    exec: (text) => inner.exec(text),
    transaction: (fn) => inner.transaction(fn),
    close: () => inner.close(),
    tenantTransaction<T>(tenantId: string, fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
      probe.tenantTransactions += 1;
      return inner.tenantTransaction(tenantId, async (tx) => {
        const result = await fn(tx);
        // The simulated bug: no WHERE clause at all. RLS must contain it.
        const leaked: QueryResult = await tx.query('SELECT tenant_id FROM findings');
        for (const row of leaked.rows) probe.leakedTenants.add(String(row.tenant_id));
        return result;
      });
    },
  };
}

const finding = (marker: string) => ({
  layer: 'T',
  severity: 'info',
  variant: 'anomaly',
  headline: `Finding for ${marker}.`,
  summary: `Belongs to ${marker}.`,
  metrics: [{ label: 'task_success_rate', value: '71.0%', query_id: 'q_aaaaaaaaaaaaaaaa' }],
  evidence: [{ title: 'evidence', query_id: 'q_aaaaaaaaaaaaaaaa' }],
});

describe('served-path RLS engagement', () => {
  let db: SqlExecutor;
  let probe: Probe;
  let store: RegistryStore;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    probe = { tenantTransactions: 0, leakedTenants: new Set() };
    store = new RegistryStore(probedExecutor(db, probe));
    // Both tenants publish a finding, so an uncontained unscoped read
    // inside either tenant's transaction would see the other's rows.
    tenantA = (await store.createTenant('Tenant A')).tenantId;
    tenantB = (await store.createTenant('Tenant B')).tenantId;
    await store.publishFinding(tenantA, finding('tenant A'), 'test');
    await store.publishFinding(tenantB, finding('tenant B'), 'test');
  });

  it('every tenant-scoped store method runs inside tenantTransaction', async () => {
    const before = probe.tenantTransactions;
    await store.listEntries(tenantA);
    await store.listFindings(tenantA);
    await store.getAutonomy(tenantA);
    await store.getBilling(tenantA);
    await store.getOnboarding(tenantA);
    await store.listTokens(tenantA);
    await store.listAudit(tenantA);
    await store.listInstrumentRuns(tenantA);
    await store.listExperiments(tenantA);
    await store.getRetentionDays(tenantA);
    await store.getBenchmarkOptin(tenantA);
    expect(probe.tenantTransactions - before).toBe(11);
  });

  it("an unscoped query inside the store's own transaction sees only that tenant's rows", async () => {
    probe.leakedTenants.clear();
    await store.listFindings(tenantA);
    expect([...probe.leakedTenants]).toEqual([tenantA]);

    probe.leakedTenants.clear();
    await store.listFindings(tenantB);
    expect([...probe.leakedTenants]).toEqual([tenantB]);
  });

  it('fails closed: the toqar_app role with no tenant context sees nothing', async () => {
    const { rows } = await db.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE toqar_app');
      return tx.query('SELECT tenant_id FROM findings');
    });
    expect(rows).toHaveLength(0);
  });

  it('writes under the scoped session pin the tenant (WITH CHECK)', async () => {
    // A write for tenant B attempted inside tenant A's session must be
    // rejected by the policy, not silently accepted.
    await expect(
      db.tenantTransaction(tenantA, (tx) =>
        tx.query('INSERT INTO findings (id, tenant_id, finding) VALUES ($1, $2, $3)', [
          'f_smuggled',
          tenantB,
          JSON.stringify(finding('smuggled')),
        ]),
      ),
    ).rejects.toThrow();
  });
});

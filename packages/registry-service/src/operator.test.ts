import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteExecutor } from './db/pglite.js';
import { migrate } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { OperatorStore } from './operator.js';
import { RegistryStore } from './store.js';
import type { SqlExecutor } from './db/executor.js';

async function fresh() {
  const db = await createPgliteExecutor();
  await migrate(db, MIGRATIONS);
  return db;
}

describe('OperatorStore', () => {
  let db: SqlExecutor;
  let ops: OperatorStore;
  let registry: RegistryStore;

  beforeEach(async () => {
    db = await fresh();
    ops = new OperatorStore(db);
    registry = new RegistryStore(db);
  });

  describe('operator tokens', () => {
    it('mints and resolves a token; wrong and revoked tokens do not resolve', async () => {
      const { token, token_id } = await ops.createOperatorToken('alice@toqar');
      expect(await ops.resolveOperatorToken(token)).toEqual({ operator: 'alice@toqar' });
      expect(await ops.resolveOperatorToken('optok_nope')).toBeNull();

      await ops.revokeOperatorToken('alice@toqar', token_id);
      expect(await ops.resolveOperatorToken(token)).toBeNull();
    });

    it('a tenant token is not an operator token', async () => {
      const tenant = await registry.createTenant('Acme');
      expect(await ops.resolveOperatorToken(tenant.token)).toBeNull();
    });

    it('the operator tables are owner-only — the tenant/RLS role cannot read them', async () => {
      const tenant = await registry.createTenant('Acme');
      await ops.createOperatorToken('alice@toqar');
      // Owner path sees them.
      const owner = await db.query('SELECT count(*)::int AS c FROM operator_tokens');
      expect(Number(owner.rows[0]!.c)).toBe(1);
      // The non-owner toqar_app role (every tenant request) must be refused.
      await expect(
        db.tenantTransaction(tenant.tenantId, (tx) => tx.query('SELECT * FROM operator_tokens')),
      ).rejects.toThrow();
    });

    it('issuing a token is audited', async () => {
      await ops.createOperatorToken('alice@toqar');
      const audit = await ops.listOperatorAudit();
      expect(audit.some((a) => a.action === 'token_issued' && a.operator === 'alice@toqar')).toBe(true);
    });
  });

  describe('cross-tenant reads are audited', () => {
    it('records the operator identity on every read', async () => {
      await registry.createTenant('Acme');
      await ops.listTenants('alice@toqar');
      await ops.rollups('alice@toqar');
      const audit = await ops.listOperatorAudit();
      const actions = audit.filter((a) => a.operator === 'alice@toqar').map((a) => a.action);
      expect(actions).toContain('list_tenants');
      expect(actions).toContain('rollups');
    });
  });

  describe('tenant list and drill-down', () => {
    it('lists every tenant with summary state', async () => {
      const acme = await registry.createTenant('Acme');
      const globex = await registry.createTenant('Globex');
      await registry.grantAutonomy(acme.tenantId, { level: 1, granted_by: 'founder' }, 'test');
      await registry.setBilling(globex.tenantId, { tier: 'growth' });

      const { tenants } = await ops.listTenants('op');
      expect(tenants).toHaveLength(2);
      const byName = Object.fromEntries(tenants.map((t) => [t.name, t]));
      expect(byName.Acme!.autonomy_level).toBe(1);
      expect(byName.Globex!.billing_tier).toBe('growth');
      expect(byName.Acme!.onboarding_step).toBe('connect_repo');
    });

    it('drill-down assembles the tenant real recorded state', async () => {
      const acme = await registry.createTenant('Acme');
      await registry.recordInstrumentRun(
        acme.tenantId,
        { repo: 'acme/app', agent_version: 'a@1', tokens_in: 1, tokens_out: 1, cost_usd: 0.1 },
        'test',
      );
      const snap = await ops.tenantSnapshot('op', acme.tenantId);
      expect(snap).not.toBeNull();
      expect(snap!.name).toBe('Acme');
      expect((snap!.registry as { total: number }).total).toBeGreaterThan(0);
      expect((snap!.instrument_runs as { runs: unknown[] }).runs).toHaveLength(1);
    });

    it('unknown tenant is null (and not audited)', async () => {
      expect(await ops.tenantSnapshot('op', 't_missing')).toBeNull();
      const audit = await ops.listOperatorAudit();
      expect(audit.some((a) => a.action === 'tenant_snapshot')).toBe(false);
    });
  });

  describe('rollups reconcile to source records', () => {
    it('merge rate equals merged over delivered across all tenants', async () => {
      const acme = await registry.createTenant('Acme');
      const globex = await registry.createTenant('Globex');
      const r1 = await registry.recordInstrumentRun(acme.tenantId, { repo: 'a/1', agent_version: 'a@1' }, 'test');
      const r2 = await registry.recordInstrumentRun(acme.tenantId, { repo: 'a/2', agent_version: 'a@1' }, 'test');
      const r3 = await registry.recordInstrumentRun(globex.tenantId, { repo: 'g/1', agent_version: 'a@1' }, 'test');
      await registry.updateRunOutcome(acme.tenantId, r1.run_id, 'merged', 'test');
      await registry.updateRunOutcome(acme.tenantId, r2.run_id, 'edited_then_merged', 'test');
      await registry.updateRunOutcome(globex.tenantId, r3.run_id, 'rejected', 'test');

      const roll = await ops.rollups('op');
      expect(roll.merge_rate).toEqual({ merged: 2, delivered: 3 });
      expect(roll.tenants).toBe(2);
    });

    it('revenue counts committed billing accounts only', async () => {
      const acme = await registry.createTenant('Acme');
      await registry.createTenant('Globex'); // no billing account committed
      await registry.setBilling(acme.tenantId, { tier: 'growth' });

      const roll = await ops.rollups('op');
      expect(roll.revenue.accounts_by_tier).toEqual({ growth: 1 });
      expect(roll.revenue.recurring_usd_month).toBe(800);
    });

    it('empty platform is honest — zeros and nulls, never a placeholder', async () => {
      const roll = await ops.rollups('op');
      expect(roll.tenants).toBe(0);
      expect(roll.merge_rate).toEqual({ merged: 0, delivered: 0 });
      expect(roll.finding_rejections).toEqual([]);
      expect(roll.median_time_to_first_finding_ms).toBeNull();
      expect(roll.revenue.recurring_usd_month).toBe(0);
    });
  });

  describe('erasure lifecycle (spec: data-governance)', () => {
    it('records request before deletion and completion after, doubly audited', async () => {
      const acme = await registry.createTenant('Acme');
      const { erasure_id } = await ops.requestErasure('alice@toqar', acme.tenantId, 'tenant');
      let erasures = await ops.listErasures(acme.tenantId);
      expect(erasures[0]).toMatchObject({ scope: 'tenant', requested_by: 'alice@toqar', completed_at: null });

      await ops.completeErasure('alice@toqar', erasure_id, { events_deleted: true, crypto_shredded: true });
      erasures = await ops.listErasures(acme.tenantId);
      expect(erasures[0]!.completed_at).not.toBeNull();
      expect(erasures[0]!.detail).toMatchObject({ crypto_shredded: true });

      const audit = await ops.listOperatorAudit();
      const actions = audit.map((a) => a.action);
      expect(actions).toContain('erasure_requested');
      expect(actions).toContain('erasure_completed');
    });

    it('per-end-user scope carries the subject', async () => {
      const acme = await registry.createTenant('Acme2');
      await ops.requestErasure('alice@toqar', acme.tenantId, 'end_user', 's_42');
      const erasures = await ops.listErasures(acme.tenantId);
      expect(erasures[0]).toMatchObject({ scope: 'end_user', subject: 's_42' });
    });

    it('the erasure record is owner-only — the tenant/RLS role cannot read it', async () => {
      const acme = await registry.createTenant('Acme3');
      await ops.requestErasure('alice@toqar', acme.tenantId, 'tenant');
      await expect(
        db.tenantTransaction(acme.tenantId, (tx) => tx.query('SELECT * FROM erasure_audit')),
      ).rejects.toThrow();
    });
  });

  describe('service health', () => {
    it('reports ok when the database is reachable', async () => {
      expect(await ops.health()).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('reports degraded when a probe fails, never ok', async () => {
      const throwing = {
        query: async () => {
          throw new Error('db down');
        },
        exec: async () => {},
        transaction: async () => {
          throw new Error('db down');
        },
        tenantTransaction: async () => {
          throw new Error('db down');
        },
        close: async () => {},
      } as unknown as SqlExecutor;
      const health = await new OperatorStore(throwing).health();
      expect(health.status).toBe('degraded');
      expect(health.database).toBe('down');
    });
  });
});

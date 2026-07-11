import { createHash, randomUUID } from 'node:crypto';
import { TIERS } from '@toqar/billing';
import type { SqlExecutor } from './db/executor.js';
import { RegistryStore } from './store.js';

/**
 * The operator plane (spec: operator-console): the one deliberate
 * cross-tenant read path. Every method runs as the owner (bypassing
 * per-tenant RLS by design) and is the *only* code that reads across
 * tenants for operations. Operator credentials live in their own
 * owner-only table — a tenant token can never resolve here — and every
 * cross-tenant read is appended to operator_audit naming the operator.
 * No number is modeled: each rollup reproduces from source rows.
 */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const TIER_PRICE = new Map(TIERS.map((t) => [t.name, t.price_usd_month]));

export interface TenantSummary {
  tenant_id: string;
  name: string;
  onboarding_step: string;
  autonomy_level: number;
  billing_tier: string;
}

export interface OperatorRollups {
  tenants: number;
  merge_rate: { merged: number; delivered: number };
  finding_rejections: { reason: string; count: number }[];
  onboarding_funnel: Record<string, number>;
  median_time_to_first_finding_ms: number | null;
  revenue: {
    recurring_usd_month: number;
    accounts_by_tier: Record<string, number>;
    invoiced_usd_total: number;
  };
}

export interface OperatorHealth {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  services: { name: string; status: 'ok' | 'degraded' }[];
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export class OperatorStore {
  private readonly registry: RegistryStore;

  constructor(private readonly db: SqlExecutor) {
    this.registry = new RegistryStore(db);
  }

  /** Bootstrap: mint an operator token for a named operator. Audited. */
  async createOperatorToken(operator: string): Promise<{ token_id: string; token: string; prefix: string }> {
    if (!operator.trim()) throw new Error('operator identity required');
    const token = `optok_${randomUUID()}`;
    const tokenId = `op_${randomUUID()}`;
    const prefix = token.slice(0, 14);
    await this.db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO operator_tokens (id, operator, token_hash, prefix) VALUES ($1, $2, $3, $4)',
        [tokenId, operator, hashToken(token), prefix],
      );
      await tx.query('INSERT INTO operator_audit (operator, action, detail) VALUES ($1, $2, $3)', [
        operator,
        'token_issued',
        JSON.stringify({ token_id: tokenId, prefix }),
      ]);
    });
    return { token_id: tokenId, token, prefix };
  }

  /** Resolves an operator token; revoked tokens fail immediately. */
  async resolveOperatorToken(token: string): Promise<{ operator: string } | null> {
    const { rows } = await this.db.query(
      'SELECT operator FROM operator_tokens WHERE token_hash = $1 AND revoked_at IS NULL',
      [hashToken(token)],
    );
    return rows.length ? { operator: rows[0]!.operator as string } : null;
  }

  async revokeOperatorToken(operator: string, tokenId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query(
        'SELECT id FROM operator_tokens WHERE id = $1 AND revoked_at IS NULL',
        [tokenId],
      );
      if (!rows.length) return false;
      await tx.query('UPDATE operator_tokens SET revoked_at = now() WHERE id = $1', [tokenId]);
      await tx.query('INSERT INTO operator_audit (operator, action, detail) VALUES ($1, $2, $3)', [
        operator,
        'token_revoked',
        JSON.stringify({ token_id: tokenId }),
      ]);
      return true;
    });
  }

  private async audit(operator: string, action: string, detail: unknown): Promise<void> {
    await this.db.query('INSERT INTO operator_audit (operator, action, detail) VALUES ($1, $2, $3)', [
      operator,
      action,
      JSON.stringify(detail ?? {}),
    ]);
  }

  async listOperatorAudit(limit = 100): Promise<Record<string, unknown>[]> {
    const { rows } = await this.db.query(
      'SELECT operator, action, detail, created_at FROM operator_audit ORDER BY id DESC LIMIT $1',
      [limit],
    );
    return rows;
  }

  /** Cross-tenant: every tenant with summary state. Audited. */
  async listTenants(operator: string): Promise<{ tenants: TenantSummary[] }> {
    await this.audit(operator, 'list_tenants', {});
    const { rows } = await this.db.query('SELECT id, name FROM tenants ORDER BY created_at, id');
    const tenants: TenantSummary[] = [];
    for (const r of rows) {
      const tenantId = r.id as string;
      const [onboarding, autonomy, billing] = [
        await this.registry.getOnboarding(tenantId),
        await this.registry.getAutonomy(tenantId),
        await this.registry.getBilling(tenantId),
      ];
      tenants.push({
        tenant_id: tenantId,
        name: r.name as string,
        onboarding_step: String(onboarding.current_step),
        autonomy_level: autonomy.level,
        billing_tier: String(billing.tier),
      });
    }
    return { tenants };
  }

  /** Cross-tenant drill-down: one tenant's actual recorded state. Audited. */
  async tenantSnapshot(operator: string, tenantId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.db.query('SELECT id, name, created_at FROM tenants WHERE id = $1', [
      tenantId,
    ]);
    if (!rows.length) return null;
    await this.audit(operator, 'tenant_snapshot', { tenant_id: tenantId });
    const entries = await this.registry.listEntries(tenantId);
    return {
      tenant_id: tenantId,
      name: rows[0]!.name as string,
      created_at: String(rows[0]!.created_at),
      registry: {
        total: entries.length,
        active: entries.filter((e) => e.status === 'active').length,
        deprecated: entries.filter((e) => e.status === 'deprecated').length,
      },
      onboarding: await this.registry.getOnboarding(tenantId),
      autonomy: await this.registry.getAutonomy(tenantId),
      billing: await this.registry.getBilling(tenantId),
      instrument_runs: await this.registry.listInstrumentRuns(tenantId),
      experiments: await this.registry.listExperiments(tenantId),
    };
  }

  /** Cross-tenant rollups, each reproducible from source rows. Audited. */
  async rollups(operator: string): Promise<OperatorRollups> {
    await this.audit(operator, 'rollups', {});

    const runs = await this.db.query(
      `SELECT count(*)::int AS delivered,
              count(*) FILTER (WHERE outcome IN ('merged', 'edited_then_merged'))::int AS merged
       FROM instrument_runs`,
    );
    const merge_rate = {
      merged: Number(runs.rows[0]?.merged ?? 0),
      delivered: Number(runs.rows[0]?.delivered ?? 0),
    };

    const rej = await this.db.query(
      'SELECT reason, count(*)::int AS count FROM finding_rejections GROUP BY reason ORDER BY count DESC, reason',
    );

    const tenantRows = await this.db.query('SELECT id FROM tenants');
    const onboarding_funnel: Record<string, number> = {};
    const ttfs: number[] = [];
    for (const t of tenantRows.rows) {
      const ob = await this.registry.getOnboarding(t.id as string);
      const step = String(ob.current_step);
      onboarding_funnel[step] = (onboarding_funnel[step] ?? 0) + 1;
      if (typeof ob.time_to_first_finding_ms === 'number') ttfs.push(ob.time_to_first_finding_ms);
    }

    // Recognized revenue = committed billing accounts only (an implicit
    // starter default is a display value, not a subscription — not counted).
    const accounts = await this.db.query(
      'SELECT tier, count(*)::int AS count FROM billing_accounts GROUP BY tier',
    );
    const accounts_by_tier: Record<string, number> = {};
    let recurring_usd_month = 0;
    for (const a of accounts.rows) {
      const tier = String(a.tier);
      const count = Number(a.count);
      accounts_by_tier[tier] = count;
      recurring_usd_month += (TIER_PRICE.get(tier) ?? 0) * count;
    }
    const inv = await this.db.query(
      'SELECT coalesce(sum(amount_usd), 0)::float8 AS invoiced FROM billing_invoices',
    );

    return {
      tenants: tenantRows.rows.length,
      merge_rate,
      finding_rejections: rej.rows.map((r) => ({ reason: r.reason as string, count: Number(r.count) })),
      onboarding_funnel,
      median_time_to_first_finding_ms: median(ttfs),
      revenue: {
        recurring_usd_month,
        accounts_by_tier,
        invoiced_usd_total: Number(inv.rows[0]?.invoiced ?? 0),
      },
    };
  }

  /**
   * Truthful service health. The registry database is probed directly; the
   * collector's broker state is per-instance and in-memory, so it is
   * surfaced only where a collector health probe is wired in deployment —
   * never fabricated here.
   */
  async health(): Promise<OperatorHealth> {
    let database: 'up' | 'down' = 'up';
    try {
      await this.db.query('SELECT 1');
    } catch {
      database = 'down';
    }
    const dbStatus = database === 'up' ? 'ok' : 'degraded';
    return {
      status: dbStatus,
      database,
      services: [{ name: 'registry-database', status: dbStatus }],
    };
  }
}

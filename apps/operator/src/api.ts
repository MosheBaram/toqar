/**
 * The operator API client. Types mirror the server shapes (spec:
 * operator-console) — the console never invents a field the backend did
 * not send. Every request carries the operator bearer token.
 */

export interface TenantSummary {
  tenant_id: string;
  name: string;
  onboarding_step: string;
  autonomy_level: number;
  billing_tier: string;
}

export interface TenantSnapshot {
  tenant_id: string;
  name: string;
  created_at: string;
  registry: { total: number; active: number; deprecated: number };
  onboarding: Record<string, unknown>;
  autonomy: { level: number; history: unknown[] };
  billing: Record<string, unknown>;
  instrument_runs: { runs: unknown[]; merge_rate: { merged: number; delivered: number } };
  experiments: unknown[];
}

export interface Rollups {
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

export interface Health {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  services: { name: string; status: 'ok' | 'degraded' }[];
}

export interface OperatorApi {
  listTenants(): Promise<TenantSummary[]>;
  getTenant(id: string): Promise<TenantSnapshot | null>;
  getRollups(): Promise<Rollups>;
  getHealth(): Promise<Health>;
}

export function createOperatorApi(baseUrl: string, token: string): OperatorApi {
  const headers = { authorization: `Bearer ${token}` };

  async function call(path: string): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`operator api ${res.status} on ${path}`);
    return res.json();
  }

  return {
    async listTenants() {
      const body = (await call('/operator/tenants')) as { tenants: TenantSummary[] };
      return body.tenants;
    },
    getTenant(id) {
      return call(`/operator/tenants/${encodeURIComponent(id)}`) as Promise<TenantSnapshot | null>;
    },
    getRollups() {
      return call('/operator/rollups') as Promise<Rollups>;
    },
    getHealth() {
      return call('/operator/health') as Promise<Health>;
    },
  };
}

import type { Finding, RegistryEntry } from '@toqar/registry';

/** Findings as the feed consumes them (server shape + id/published_at). */
export type FeedFinding = Finding & { finding_id: string; published_at: string };

export interface TenantApi {
  listFindings(): Promise<FeedFinding[]>;
  getFinding(id: string): Promise<(FeedFinding & { deliveries: unknown[] }) | null>;
  getRegistry(): Promise<RegistryEntry[]>;
  getAutonomy(): Promise<{ level: number; history: { level: number; granted_by: string; granted_at: string }[] }>;
  grantAutonomy(level: number, grantedBy: string): Promise<{ level: number }>;
}

export function createTenantApi(baseUrl: string, token: string): TenantApi {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`api ${res.status} on ${path}`);
    return res.json();
  }

  return {
    async listFindings() {
      const body = (await call('/v1/findings')) as { findings: FeedFinding[] };
      return body.findings;
    },
    async getFinding(id) {
      return (await call(`/v1/findings/${id}`)) as (FeedFinding & { deliveries: unknown[] }) | null;
    },
    async getRegistry() {
      const body = (await call('/v1/registry/events')) as { entries: RegistryEntry[] };
      return body.entries;
    },
    async getAutonomy() {
      return (await call('/v1/autonomy')) as Awaited<ReturnType<TenantApi['getAutonomy']>>;
    },
    async grantAutonomy(level, grantedBy) {
      return (await call('/v1/autonomy', {
        method: 'PUT',
        body: JSON.stringify({ level, granted_by: grantedBy }),
      })) as { level: number };
    },
  };
}

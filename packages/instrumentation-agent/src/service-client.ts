import {
  registryEntrySchema,
  seamMapSchema,
  type RegistryEntry,
  type SeamMap,
} from '@toqar/registry';
import { z } from 'zod';

const listResponseSchema = z.object({
  fingerprint: z.string().min(1),
  entries: z.array(registryEntrySchema),
});

/** Minimal registry-backend client for the agent's needs. */
export interface RegistryServiceClient {
  fetchRegistry(): Promise<{ fingerprint: string; entries: RegistryEntry[] }>;
  putSeamMap(map: SeamMap): Promise<void>;
  getSeamMap(repo: string): Promise<SeamMap | null>;
  recordRun(record: {
    repo: string;
    pr_url?: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    model: string | null;
    agent_version: string;
  }): Promise<{ run_id: string }>;
}

export function createServiceClient(baseUrl: string, token: string): RegistryServiceClient {
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) {
      throw new Error(`registry service ${res.status}: ${body.message ?? body.error ?? 'error'}`);
    }
    return body;
  }

  return {
    async fetchRegistry() {
      return listResponseSchema.parse(await call('/v1/registry/events'));
    },
    async putSeamMap(map) {
      await call('/v1/registry/seam-map', { method: 'PUT', body: JSON.stringify(map) });
    },
    async getSeamMap(repo) {
      const res = await fetch(
        `${baseUrl}/v1/registry/seam-map?repo=${encodeURIComponent(repo)}`,
        { headers },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`registry service ${res.status} fetching seam map`);
      return seamMapSchema.parse(await res.json());
    },
    async recordRun(record) {
      return z
        .object({ run_id: z.string().min(1) })
        .parse(
          await call('/v1/registry/instrument-runs', {
            method: 'POST',
            body: JSON.stringify(record),
          }),
        );
    },
  };
}

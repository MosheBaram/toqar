import {
  registryEntrySchema,
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
  };
}

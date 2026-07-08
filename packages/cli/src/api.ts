import {
  registryEntrySchema,
  type RegistryEntry,
  type TrackingPlan,
} from '@toqar/registry';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const listResponseSchema = z.object({
  fingerprint: z.string().min(1),
  entries: z.array(registryEntrySchema),
});

const applyResponseSchema = z.object({
  added: z.number().int(),
  modified: z.number().int(),
  removed: z.number().int(),
});

export interface RegistryApi {
  fetchRegistry(): Promise<{ fingerprint: string; entries: RegistryEntry[] }>;
  applyPlan(
    plan: TrackingPlan,
    fingerprint: string,
  ): Promise<{ added: number; modified: number; removed: number }>;
}

export function createRegistryApi(baseUrl: string, token: string): RegistryApi {
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    } catch (err) {
      throw new ApiError(0, `cannot reach ${baseUrl}: ${(err as Error).message}`);
    }
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) {
      throw new ApiError(res.status, body.message ?? body.error ?? `HTTP ${res.status}`);
    }
    return body;
  }

  return {
    async fetchRegistry() {
      return listResponseSchema.parse(await call('/v1/registry/events'));
    },
    async applyPlan(plan, fingerprint) {
      return applyResponseSchema.parse(
        await call('/v1/registry/apply', {
          method: 'POST',
          body: JSON.stringify({ plan, fingerprint }),
        }),
      );
    },
  };
}

import type { ClickHouseClient } from '@clickhouse/client';
import { describe, expect, it } from 'vitest';
import { createResidencyRouter } from './redpanda.js';

describe('residency routing (spec: data-governance)', () => {
  const us = { tag: 'us' } as unknown as ClickHouseClient;
  const eu = { tag: 'eu' } as unknown as ClickHouseClient;

  it('routes an EU-tagged tenant to the EU cluster, everything else to the default', () => {
    const route = createResidencyRouter({ us, eu });
    expect(route('eu')).toBe(eu);
    expect(route('us')).toBe(us);
    expect(route('unknown')).toBe(us); // never dropped over routing
  });

  it('single-region deployments send everything to the one cluster', () => {
    const route = createResidencyRouter({ us });
    expect(route('eu')).toBe(us);
  });
});

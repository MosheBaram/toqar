import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planFor, resolveTier, TIERS, usageMeterSql } from './billing.js';

describe('usage meters reconcile to source', () => {
  it('each meter is a tenant-scoped, FINAL-reading query over toqar.events', () => {
    for (const metric of ['events_ingested', 'tasks_tracked', 'agent_runs'] as const) {
      const sql = usageMeterSql(metric, {
        tenantId: 't_1',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
      });
      expect(sql).toContain('{tenantId:String}');
      expect(sql).toContain('FROM toqar.events FINAL');
      expect(sql).toContain('AS value');
    }
  });

  it('events_ingested counts all events; tasks_tracked counts distinct tasks', () => {
    const events = usageMeterSql('events_ingested', { tenantId: 't', from: 'a', to: 'b' });
    expect(events).toContain('count()');
    const tasks = usageMeterSql('tasks_tracked', { tenantId: 't', from: 'a', to: 'b' });
    expect(tasks).toContain('uniqExact(task_id)');
  });

  it('rejects an unknown meter', () => {
    // @ts-expect-error deliberately unknown
    expect(() => usageMeterSql('vibes', { tenantId: 't', from: 'a', to: 'b' })).toThrow(/meter/);
  });
});

describe('tiers', () => {
  it('are defined in code with limits and prices', () => {
    expect(TIERS.length).toBeGreaterThanOrEqual(2);
    for (const tier of TIERS) {
      expect(tier.price_usd_month).toBeGreaterThanOrEqual(0);
      expect(tier.limits.events_ingested).toBeGreaterThan(0);
    }
  });

  it('resolves the smallest tier whose limit covers usage', () => {
    const tier = resolveTier({ events_ingested: 5000, tasks_tracked: 100, agent_runs: 10 });
    expect(tier.name).toBe('starter');
    const big = resolveTier({ events_ingested: 5_000_000, tasks_tracked: 100_000, agent_runs: 5000 });
    expect(big.name).toBe('growth');
  });

  it('planFor shows tier, limits, and usage-against-limit without surprise overage', () => {
    const plan = planFor('starter', { events_ingested: 8000, tasks_tracked: 200, agent_runs: 20 });
    expect(plan.tier).toBe('starter');
    expect(plan.usage.events_ingested).toBe(8000);
    expect(plan.limits.events_ingested).toBeGreaterThan(0);
    expect(plan.over_limit).toBe(false);
  });
});

describe('no card data in Toqar (spec: payments via provider)', () => {
  it('billing source contains no card/CVV handling — only provider references', () => {
    const src = readFileSync(new URL('./billing.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bcvv\b/i);
    expect(src).not.toMatch(/card_number|cardNumber|pan\b/i);
    // provider references are the only payment identifiers
    expect(src).toMatch(/customer_id|subscription_id/);
  });
});

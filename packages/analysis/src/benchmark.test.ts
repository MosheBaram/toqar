import { describe, expect, it } from 'vitest';
import { computeBenchmark, DEFAULT_K } from './benchmark.js';

/** Each contribution is one opted-in tenant's computed metric value. */
const contributions = (values: number[]) =>
  values.map((v, i) => ({ tenantId: `t_${i}`, value: v }));

describe('computeBenchmark — opt-in + k-anonymity', () => {
  it('suppresses a cohort below k (insufficient cohort, no number)', () => {
    const result = computeBenchmark(contributions([0.6, 0.7, 0.8]), { k: 5 });
    expect(result.suppressed).toBe(true);
    expect(result.reason).toContain('insufficient cohort');
    expect(result.distribution).toBeUndefined();
  });

  it('computes a blended distribution once at least k tenants contribute', () => {
    const result = computeBenchmark(contributions([0.5, 0.55, 0.6, 0.62, 0.71]), { k: 5 });
    expect(result.suppressed).toBe(false);
    expect(result.n).toBe(5);
    // mean of [0.5,0.55,0.6,0.62,0.71] = 0.596 — blends all, equals no raw value
    expect(result.distribution!.mean).toBeCloseTo(0.596, 5);
    expect(result.distribution!.stddev).toBeGreaterThan(0);
    expect(result.distribution!.count).toBe(5);
  });

  it('reconciles: the mean equals the mean of contributed values', () => {
    const vals = [0.4, 0.42, 0.5, 0.66, 0.7, 0.8];
    const result = computeBenchmark(contributions(vals), { k: 5 });
    const expectedMean = vals.reduce((a, b) => a + b, 0) / vals.length;
    expect(result.distribution!.mean).toBeCloseTo(expectedMean, 4);
  });

  it('never exposes a raw value, min/max, or tenant id in the published output', () => {
    const raws = [0.5, 0.55, 0.6, 0.62, 0.71];
    const result = computeBenchmark(contributions(raws), { k: 5 });
    if (result.suppressed) throw new Error('unexpected suppression');

    // only blended aggregates are published — no min/max/quantile fields exist
    expect(Object.keys(result.distribution).sort()).toEqual(['count', 'mean', 'stddev']);
    // no tenant id anywhere
    expect(JSON.stringify(result)).not.toContain('t_0');
    // no published aggregate equals an individual raw value (incl. the extremes)
    const published = [result.distribution.mean, result.distribution.stddev];
    for (const raw of raws) expect(published).not.toContain(raw);
  });

  it('places a tenant against the cohort without revealing others', () => {
    const result = computeBenchmark(contributions([0.5, 0.55, 0.6, 0.62, 0.71]), { k: 5, ownValue: 0.62 });
    expect(result.own_percentile).toBeGreaterThan(0);
    expect(result.own_percentile).toBeLessThanOrEqual(100);
  });

  it('defaults k to at least 5', () => {
    expect(DEFAULT_K).toBeGreaterThanOrEqual(5);
    const result = computeBenchmark(contributions([0.1, 0.2, 0.3, 0.4]));
    expect(result.suppressed).toBe(true);
  });
});

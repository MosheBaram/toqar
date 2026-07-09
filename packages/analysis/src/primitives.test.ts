import { describe, expect, it } from 'vitest';
import {
  detectAnomaliesIqr,
  detectAnomaliesMad,
  detectAnomaliesZScore,
  detectChangepoint,
  rankCorrelations,
  rankSegmentContributions,
} from './primitives.js';

const stable = [10, 11, 9, 10, 10, 11, 9, 10, 10, 11];

describe('anomaly detection', () => {
  it('z-score flags a planted outlier with the baseline that justified it', () => {
    const verdicts = detectAnomaliesZScore([...stable, 40]);
    const last = verdicts[verdicts.length - 1];
    expect(last?.anomalous).toBe(true);
    expect(last?.baseline?.mean).toBeCloseTo(10.1, 1);
    expect(last?.baseline?.stdDev).toBeGreaterThan(0);
    expect(verdicts.slice(5, 10).every((v) => v?.anomalous === false)).toBe(true);
  });

  it('modified z-score (MAD) flags the outlier robustly', () => {
    const verdicts = detectAnomaliesMad([...stable, 40]);
    expect(verdicts[verdicts.length - 1]?.anomalous).toBe(true);
    expect(verdicts[verdicts.length - 1]?.baseline?.median).toBeCloseTo(10, 5);
    expect(verdicts[verdicts.length - 1]?.baseline?.mad).toBeGreaterThan(0);
  });

  it('IQR flags values beyond the whiskers', () => {
    const verdicts = detectAnomaliesIqr([...stable, 40]);
    const last = verdicts[verdicts.length - 1];
    expect(last?.anomalous).toBe(true);
    expect(last?.baseline?.q3).toBeGreaterThanOrEqual(last?.baseline?.q1 ?? Infinity * -1);
  });

  it('early points with insufficient history are marked, not guessed', () => {
    const verdicts = detectAnomaliesZScore([10, 11, 40]);
    expect(verdicts[2]?.anomalous).toBe(false);
    expect(verdicts[2]?.insufficient).toBe(true);
  });

  it('gaps stay gaps: null in, null verdict out, baselines skip them', () => {
    const verdicts = detectAnomaliesZScore([...stable.slice(0, 5), null, ...stable.slice(5), 40]);
    expect(verdicts[5]).toBeNull();
    expect(verdicts[verdicts.length - 1]?.anomalous).toBe(true);
  });
});

describe('changepoint detection', () => {
  it('locates a step change with magnitude and significance', () => {
    const result = detectChangepoint([71, 72, 70, 71, 71, 62, 61, 63, 62, 62]);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.index - 5)).toBeLessThanOrEqual(1);
    expect(result!.magnitude).toBeCloseTo(-9, 0);
    expect(result!.significance).toBeGreaterThan(3);
  });

  it('returns null for a flat series instead of inventing a change', () => {
    expect(detectChangepoint([10, 10, 10, 10, 10, 10, 10, 10])).toBeNull();
  });
});

describe('segmentation drill-down', () => {
  it('ranks segments by contribution to the aggregate change', () => {
    const ranked = rankSegmentContributions([
      { key: 'crm_lookup', before: 10, after: 52 },
      { key: 'email_send', before: 5, after: 8 },
      { key: 'search', before: 3, after: 3 },
    ]);
    expect(ranked[0]).toMatchObject({ key: 'crm_lookup', delta: 42 });
    expect(ranked[0]!.share).toBeCloseTo(42 / 45, 2);
    expect(ranked.map((r) => r.key)).toEqual(['crm_lookup', 'email_send', 'search']);
  });
});

describe('correlation ranking', () => {
  it('ranks candidates by |coefficient| over aligned non-null pairs', () => {
    const target = [10, 9, 8, 7, 6, 5, 4, 3];
    const ranked = rankCorrelations(target, [
      { key: 'latency', series: [1, 2, 3, 4, 5, 6, 7, 8] },
      { key: 'noise', series: [5, 5, 5, 5, 5, 5, 5, 5] },
      { key: 'gappy', series: [20, null, 16, null, 12, null, 8, null] },
    ]);
    expect(ranked[0]?.key).toBe('latency');
    expect(ranked[0]?.coefficient).toBeCloseTo(-1, 5);
    const gappy = ranked.find((r) => r.key === 'gappy');
    expect(gappy?.n).toBe(4);
    expect(gappy?.coefficient).toBeCloseTo(1, 5);
    // constant series has no defined correlation — excluded, not faked
    expect(ranked.some((r) => r.key === 'noise')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { classicalSampleSize, createSequentialTest, evaluate } from './sequential.js';

/**
 * Deterministic pseudo-random stream (no Math.random — reproducibility is
 * a spec requirement and Math.random is banned in product code anyway).
 * Mulberry32.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bernoulli = (r: () => number, p: number) => (r() < p ? 1 : 0);

describe('createSequentialTest — always-valid inference', () => {
  it('returns inconclusive with no data', () => {
    const test = createSequentialTest({ alpha: 0.05 });
    const result = evaluate(test);
    expect(result.decision).toBe('inconclusive');
    expect(result.samples).toEqual({ control: 0, variant: 0 });
  });

  it('concludes ship for a real positive effect and holds it', () => {
    const r = rng(42);
    const test = createSequentialTest({ alpha: 0.05 });
    let concludedAt = -1;
    for (let i = 0; i < 4000; i++) {
      test.observe('control', bernoulli(r, 0.5));
      test.observe('variant', bernoulli(r, 0.62));
      const res = evaluate(test);
      if (concludedAt === -1 && res.decision === 'ship') concludedAt = i;
    }
    const final = evaluate(test);
    expect(final.decision).toBe('ship');
    expect(concludedAt).toBeGreaterThan(0);
    // effect ~ +0.12; confidence sequence excludes zero
    expect(final.effect).toBeGreaterThan(0);
    expect(final.interval.lower).toBeGreaterThan(0);
  });

  it('bounds the false-positive rate under continuous peeking (A/A)', () => {
    const trials = 200;
    let falsePositives = 0;
    for (let t = 0; t < trials; t++) {
      const r = rng(1000 + t);
      const test = createSequentialTest({ alpha: 0.05 });
      let flagged = false;
      for (let i = 0; i < 800; i++) {
        test.observe('control', bernoulli(r, 0.5));
        test.observe('variant', bernoulli(r, 0.5)); // identical — no true effect
        // peek every single observation, the worst case for fixed-horizon tests
        if (evaluate(test).decision !== 'inconclusive') {
          flagged = true;
          break;
        }
      }
      if (flagged) falsePositives++;
    }
    // always-valid inference keeps this at or below alpha despite max peeking.
    // generous ceiling for the finite trial count; a fixed-horizon test would blow past.
    expect(falsePositives / trials).toBeLessThanOrEqual(0.05);
  });

  it('is deterministic: same stream, same decisions', () => {
    const run = () => {
      const r = rng(7);
      const test = createSequentialTest({ alpha: 0.05 });
      for (let i = 0; i < 500; i++) {
        test.observe('control', bernoulli(r, 0.4));
        test.observe('variant', bernoulli(r, 0.55));
      }
      return evaluate(test);
    };
    expect(run()).toEqual(run());
  });

  it('narrows the confidence sequence as data accrues', () => {
    const r = rng(99);
    const test = createSequentialTest({ alpha: 0.05 });
    const widthAt = (n: number) => {
      while (test.count() < n) {
        test.observe('control', bernoulli(r, 0.5));
        test.observe('variant', bernoulli(r, 0.6));
      }
      const res = evaluate(test);
      return res.interval.upper - res.interval.lower;
    };
    const early = widthAt(100);
    const late = widthAt(2000);
    expect(late).toBeLessThan(early);
  });
});

describe('classicalSampleSize — quarry baseline', () => {
  it('computes a plausible fixed-horizon sample size', () => {
    const n = classicalSampleSize({ baseline: 0.5, mde: 0.05, alpha: 0.05, power: 0.8 });
    expect(n).toBeGreaterThan(1000);
    expect(n).toBeLessThan(3000);
  });
});

import { describe, expect, it } from 'vitest';
import { durationFromMs, mergeRatePct, usd } from './format.js';

describe('operator formatters', () => {
  it('merge rate is honest about an empty denominator', () => {
    expect(mergeRatePct(0, 0)).toBe('—');
    expect(mergeRatePct(2, 3)).toBe('66.7%');
  });

  it('formats usd and durations, with a dash for no data', () => {
    expect(usd(800)).toBe('$800');
    expect(usd(12000)).toBe('$12,000');
    expect(durationFromMs(null)).toBe('—');
    expect(durationFromMs(3_600_000)).toBe('1.0h');
    expect(durationFromMs(3 * 24 * 3_600_000)).toBe('3.0d');
  });
});

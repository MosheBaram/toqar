/**
 * Opt-in cross-tenant benchmarking (spec: benchmarking-optin). Two hard,
 * tested invariants: (1) only opted-in tenants' values reach this function
 * — enforced by the caller's query; (2) no cohort figure is published for
 * fewer than k contributors, so no raw value is re-identifiable. Figures are
 * computed deterministically from real metric results — never modeled.
 */

/** Minimum contributors before any aggregate is published. */
export const DEFAULT_K = 5;

export interface Contribution {
  tenantId: string;
  value: number;
}

export interface BenchmarkOptions {
  k?: number;
  /** The viewing tenant's own value, to place it against the cohort. */
  ownValue?: number;
}

/**
 * Only figures that blend every contributor are published. Quantiles,
 * min, and max are deliberately excluded: at small cohorts they can equal
 * an individual tenant's exact value, which would re-identify it. Mean and
 * standard deviation aggregate all k+ contributors; the viewer's own
 * position is a rank, never another tenant's value.
 */
export interface Distribution {
  mean: number;
  stddev: number;
  count: number;
}

export type BenchmarkResult =
  | { suppressed: true; reason: string; n: number }
  | {
      suppressed: false;
      n: number;
      distribution: Distribution;
      /** Rank-based position (1–100); present only when ownValue was supplied. */
      own_percentile?: number;
    };

/** Round to a fixed precision so published aggregates aren't raw values. */
function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

export function computeBenchmark(
  contributions: Contribution[],
  options: BenchmarkOptions = {},
): BenchmarkResult {
  const k = options.k ?? DEFAULT_K;
  const n = contributions.length;

  if (n < k) {
    return {
      suppressed: true,
      reason: `insufficient cohort: ${n} contributors, need at least ${k}`,
      n,
    };
  }

  const values = contributions.map((c) => c.value);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const distribution: Distribution = {
    mean: round(mean),
    stddev: round(Math.sqrt(variance)),
    count: n,
  };

  const result: BenchmarkResult = { suppressed: false, n, distribution };
  if (options.ownValue !== undefined) {
    const below = values.filter((v) => v < options.ownValue!).length;
    result.own_percentile = Math.round((below / n) * 100) || 1;
  }
  return result;
}

/**
 * Statistical primitives (spec: analysis-primitives). Pure functions:
 * data in, verdicts out. Gaps (null) are never interpolated — they stay
 * explicit in inputs and outputs.
 *
 * Provenance (design D3): the z-score / modified-z (MAD) / IQR detection
 * formulas are extracted from the old repo's
 * `new-repo-handoff/quarry/anomaly-detection.ts` (its EventEmitter
 * scaffolding severed); changepoint, segmentation, and correlation are
 * new implementations for the TOQAR playbooks.
 */

export type SeriesValue = number | null;

export interface AnomalyVerdict {
  index: number;
  value: number;
  anomalous: boolean;
  /** Method-specific score (|z|, |modified z|, or IQR distance multiple). */
  score: number;
  /** True when there was not enough history to judge — never guessed. */
  insufficient: boolean;
  baseline?: {
    mean?: number;
    stdDev?: number;
    median?: number;
    mad?: number;
    q1?: number;
    q3?: number;
  };
}

const MIN_BASELINE = 5;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], mu: number): number {
  return Math.sqrt(values.reduce((a, b) => a + (b - mu) ** 2, 0) / values.length);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

type Judge = (value: number, history: number[]) => Omit<AnomalyVerdict, 'index' | 'value' | 'insufficient'>;

function detect(series: SeriesValue[], judge: Judge): (AnomalyVerdict | null)[] {
  const history: number[] = [];
  return series.map((value, index) => {
    if (value === null) return null;
    if (history.length < MIN_BASELINE) {
      history.push(value);
      return { index, value, anomalous: false, score: 0, insufficient: true };
    }
    const verdict = { index, value, insufficient: false, ...judge(value, history) };
    history.push(value);
    return verdict;
  });
}

/** Rolling z-score: |value − mean| / stdDev over prior non-null history. */
export function detectAnomaliesZScore(
  series: SeriesValue[],
  opts: { threshold?: number } = {},
): (AnomalyVerdict | null)[] {
  const threshold = opts.threshold ?? 3;
  return detect(series, (value, history) => {
    const mu = mean(history);
    const sigma = stdDev(history, mu);
    const score = sigma === 0 ? (value === mu ? 0 : Infinity) : Math.abs(value - mu) / sigma;
    return { anomalous: score > threshold, score, baseline: { mean: mu, stdDev: sigma } };
  });
}

/** Modified z-score: 0.6745·(value − median)/MAD (quarry formula). */
export function detectAnomaliesMad(
  series: SeriesValue[],
  opts: { threshold?: number } = {},
): (AnomalyVerdict | null)[] {
  const threshold = opts.threshold ?? 3.5;
  return detect(series, (value, history) => {
    const med = median(history);
    const mad = median(history.map((v) => Math.abs(v - med)));
    const score = mad === 0 ? (value === med ? 0 : Infinity) : Math.abs((0.6745 * (value - med)) / mad);
    return { anomalous: score > threshold, score, baseline: { median: med, mad } };
  });
}

/** IQR whiskers: outside [q1 − k·iqr, q3 + k·iqr]. */
export function detectAnomaliesIqr(
  series: SeriesValue[],
  opts: { k?: number } = {},
): (AnomalyVerdict | null)[] {
  const k = opts.k ?? 1.5;
  return detect(series, (value, history) => {
    const sorted = [...history].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - k * iqr;
    const upper = q3 + k * iqr;
    const anomalous = value < lower || value > upper;
    const distance = value > upper ? value - upper : value < lower ? lower - value : 0;
    const score = iqr === 0 ? (anomalous ? Infinity : 0) : distance / iqr;
    return { anomalous, score, baseline: { q1, q3 } };
  });
}

export interface Changepoint {
  /** Index of the first point after the shift. */
  index: number;
  /** after-mean minus before-mean. */
  magnitude: number;
  /** |t|-like statistic; larger = harder to explain by noise. */
  significance: number;
}

/**
 * Single level-shift locator: maximizes a Welch-style statistic over all
 * splits with ≥3 points per side. Returns null when nothing clears the
 * significance floor — a flat series has no changepoint, not a weak one.
 */
export function detectChangepoint(
  series: number[],
  opts: { minSignificance?: number } = {},
): Changepoint | null {
  const minSignificance = opts.minSignificance ?? 3;
  let best: Changepoint | null = null;
  for (let split = 3; split <= series.length - 3; split++) {
    const before = series.slice(0, split);
    const after = series.slice(split);
    const muB = mean(before);
    const muA = mean(after);
    const varB = stdDev(before, muB) ** 2;
    const varA = stdDev(after, muA) ** 2;
    const se = Math.sqrt(varB / before.length + varA / after.length);
    const magnitude = muA - muB;
    if (magnitude === 0) continue;
    const significance = se === 0 ? Infinity : Math.abs(magnitude) / se;
    if (significance >= minSignificance && (!best || significance > best.significance)) {
      best = { index: split, magnitude, significance };
    }
  }
  return best;
}

export interface SegmentContribution {
  key: string;
  delta: number;
  /** Share of the total absolute change this segment explains. */
  share: number;
}

/** Which segment drove the aggregate change — a computation, not a vibe. */
export function rankSegmentContributions(
  segments: { key: string; before: number; after: number }[],
): SegmentContribution[] {
  const deltas = segments.map((s) => ({ key: s.key, delta: s.after - s.before }));
  const total = deltas.reduce((a, d) => a + Math.abs(d.delta), 0);
  return deltas
    .map((d) => ({ ...d, share: total === 0 ? 0 : Math.abs(d.delta) / total }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export interface CorrelationRank {
  key: string;
  /** Pearson coefficient over aligned non-null pairs. Leads, not causes. */
  coefficient: number;
  /** Number of aligned pairs used. */
  n: number;
}

export function rankCorrelations(
  target: SeriesValue[],
  candidates: { key: string; series: SeriesValue[] }[],
): CorrelationRank[] {
  const ranks: CorrelationRank[] = [];
  for (const candidate of candidates) {
    const pairs: [number, number][] = [];
    const len = Math.min(target.length, candidate.series.length);
    for (let i = 0; i < len; i++) {
      const t = target[i];
      const c = candidate.series[i];
      if (t !== null && t !== undefined && c !== null && c !== undefined) pairs.push([t, c]);
    }
    if (pairs.length < 3) continue;
    const xs = pairs.map((p) => p[0]);
    const ys = pairs.map((p) => p[1]);
    const muX = mean(xs);
    const muY = mean(ys);
    const cov = pairs.reduce((a, [x, y]) => a + (x - muX) * (y - muY), 0);
    const denom = Math.sqrt(
      xs.reduce((a, x) => a + (x - muX) ** 2, 0) * ys.reduce((a, y) => a + (y - muY) ** 2, 0),
    );
    if (denom === 0) continue; // constant series: correlation undefined — excluded, not faked
    ranks.push({ key: candidate.key, coefficient: cov / denom, n: pairs.length });
  }
  return ranks.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
}

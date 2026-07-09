/**
 * Always-valid sequential testing (spec: sequential-stats). Pure functions,
 * no LLM, no Math.random. The core is a Robbins normal-mixture confidence
 * sequence on each arm's mean: valid under *continuous* peeking, so an agent
 * can stop the moment a result is decisive without inflating the error rate.
 *
 * Provenance (design D1): the classical two-proportion sample-size and
 * z-score machinery below is the fixed-horizon baseline from
 * `new-repo-handoff/quarry/ab-testing-framework.ts`; the sequential layer is
 * the extension that makes agent-monitored experiments statistically honest.
 */

export type Arm = 'control' | 'variant';

export interface SequentialConfig {
  /** Overall false-positive ceiling under unlimited peeking. Default 0.05. */
  alpha?: number;
  /** Mixture tuning; validity holds for any rho > 0, it only affects tightness. */
  rho?: number;
}

export interface Evaluation {
  decision: 'inconclusive' | 'ship' | 'revert';
  /** variant mean minus control mean. */
  effect: number;
  /** Always-valid confidence sequence on the effect. */
  interval: { lower: number; upper: number };
  samples: { control: number; variant: number };
}

export interface SequentialTest {
  observe(arm: Arm, value: number): void;
  count(): number;
}

interface ArmState {
  n: number;
  sum: number;
}

/** Variance proxy for [0,1]-bounded observations (Hoeffding). */
const SIGMA2 = 0.25;

/**
 * Robbins normal-mixture confidence-sequence radius for a bounded mean.
 * P(exists n: |mean_n - mu| >= radius(n)) <= alpha, uniformly over n.
 */
function csRadius(n: number, alpha: number, rho: number): number {
  if (n <= 0) return Infinity;
  const term = (SIGMA2 * (n * rho + 1)) / (n * n * rho);
  const logTerm = Math.log((n * rho + 1) / (alpha * alpha));
  return Math.sqrt(term * Math.max(logTerm, 0));
}

export function createSequentialTest(config: SequentialConfig = {}): SequentialTest & {
  _state: () => { control: ArmState; variant: ArmState; alpha: number; rho: number };
} {
  const alpha = config.alpha ?? 0.05;
  const rho = config.rho ?? 1;
  const control: ArmState = { n: 0, sum: 0 };
  const variant: ArmState = { n: 0, sum: 0 };

  return {
    observe(arm, value) {
      const s = arm === 'control' ? control : variant;
      s.n += 1;
      s.sum += value;
    },
    count() {
      return Math.min(control.n, variant.n);
    },
    _state: () => ({ control, variant, alpha, rho }),
  };
}

export function evaluate(test: ReturnType<typeof createSequentialTest>): Evaluation {
  const { control, variant, alpha, rho } = test._state();
  const samples = { control: control.n, variant: variant.n };
  if (control.n === 0 || variant.n === 0) {
    return { decision: 'inconclusive', effect: 0, interval: { lower: -Infinity, upper: Infinity }, samples };
  }

  const cMean = control.sum / control.n;
  const vMean = variant.sum / variant.n;
  const effect = vMean - cMean;

  // Split alpha across the two arms; union bound gives overall <= alpha
  // coverage on the difference under continuous peeking.
  const half = alpha / 2;
  const radius = csRadius(control.n, half, rho) + csRadius(variant.n, half, rho);
  const interval = { lower: effect - radius, upper: effect + radius };

  const decision: Evaluation['decision'] =
    interval.lower > 0 ? 'ship' : interval.upper < 0 ? 'revert' : 'inconclusive';

  return { decision, effect, interval, samples };
}

/* ---------------- classical baseline (quarry) ---------------- */

/** Inverse standard-normal CDF (Acklam's rational approximation). */
export function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
}

export interface SampleSizeArgs {
  baseline: number;
  /** Minimum detectable effect (absolute). */
  mde: number;
  alpha?: number;
  power?: number;
}

/** Fixed-horizon two-proportion sample size per arm (classical baseline). */
export function classicalSampleSize(args: SampleSizeArgs): number {
  const alpha = args.alpha ?? 0.05;
  const power = args.power ?? 0.8;
  const p1 = args.baseline;
  const p2 = args.baseline + args.mde;
  const zAlpha = probit(1 - alpha / 2);
  const zBeta = probit(power);
  const variance = p1 * (1 - p1) + p2 * (1 - p2);
  return Math.ceil(((zAlpha + zBeta) ** 2 * variance) / args.mde ** 2);
}

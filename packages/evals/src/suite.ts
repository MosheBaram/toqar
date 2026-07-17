import { runCodeScorer } from './scorers.js';
import type { CodeScorer, EvalScore, Trajectory, VersionTuple } from './types.js';

/**
 * Offline suites + the CI gate (spec: eval-framework): datasets are
 * versioned collections of trajectories (typically promoted production
 * traces); a suite run scores every case and the gate passes only when
 * every scorer clears its tolerance threshold.
 */

export interface DatasetCase {
  case_id: string;
  trajectory: Trajectory;
}

export interface Dataset {
  dataset_id: string;
  version: string;
  cases: DatasetCase[];
}

export interface Threshold {
  scorer_id: string;
  /** Minimum mean score across the dataset's cases. */
  min_mean: number;
}

export interface SuiteResult {
  dataset_id: string;
  dataset_version: string;
  scores: (EvalScore & { case_id: string })[];
  per_scorer: { scorer_id: string; mean: number; cases: number }[];
}

export interface GateResult {
  pass: boolean;
  failures: { scorer_id: string; mean: number; min_mean: number; failing_cases: string[] }[];
}

export function runSuite(
  dataset: Dataset,
  scorers: CodeScorer[],
  versions: Omit<VersionTuple, 'dataset_version'>,
): SuiteResult {
  const scores = dataset.cases.flatMap((c) =>
    scorers.map((s) => ({
      ...runCodeScorer(s, c.trajectory, { ...versions, dataset_version: dataset.version }),
      case_id: c.case_id,
    })),
  );
  const per_scorer = scorers.map((s) => {
    const own = scores.filter((sc) => sc.evaluator.id === s.id);
    return {
      scorer_id: s.id,
      mean: own.length ? own.reduce((n, sc) => n + sc.value, 0) / own.length : 0,
      cases: own.length,
    };
  });
  return { dataset_id: dataset.dataset_id, dataset_version: dataset.version, scores, per_scorer };
}

/** The CI-consumable verdict: pass/fail with the failing scorers and cases named. */
export function evaluateGate(result: SuiteResult, thresholds: Threshold[]): GateResult {
  const failures = thresholds.flatMap((t) => {
    const stat = result.per_scorer.find((p) => p.scorer_id === t.scorer_id);
    if (!stat || stat.mean >= t.min_mean) return [];
    const failing_cases = result.scores
      .filter((s) => s.evaluator.id === t.scorer_id && s.value < t.min_mean)
      .map((s) => s.case_id);
    return [{ scorer_id: t.scorer_id, mean: stat.mean, min_mean: t.min_mean, failing_cases }];
  });
  return { pass: failures.length === 0, failures };
}

/**
 * Judge-vs-human agreement (spec: eval-framework): pairs judge and human
 * scores on the same trace and reports the agreement rate (within
 * tolerance). Below ~0.8 the judge needs recalibration — surfaced, never
 * hidden.
 */
export function judgeAgreement(
  scores: EvalScore[],
  opts: { tolerance?: number } = {},
): { pairs: number; agreement: number | null } {
  const tolerance = opts.tolerance ?? 0.25;
  const byTrace = new Map<string, { judge?: number; human?: number }>();
  for (const s of scores) {
    const key = `${s.trace_ref.task_id}:${s.trace_ref.run_id}`;
    const entry = byTrace.get(key) ?? {};
    if (s.evaluator.kind === 'judge') entry.judge = s.value;
    if (s.evaluator.kind === 'human') entry.human = s.value;
    byTrace.set(key, entry);
  }
  const pairs = [...byTrace.values()].filter((e) => e.judge !== undefined && e.human !== undefined);
  if (pairs.length === 0) return { pairs: 0, agreement: null };
  const agreeing = pairs.filter((e) => Math.abs(e.judge! - e.human!) <= tolerance).length;
  return { pairs: pairs.length, agreement: agreeing / pairs.length };
}

import { rubricHash, type CodeScorer, type EvalScore, type EvaluatorIdentity, type JudgeExecutor, type Trajectory, type VersionTuple } from './types.js';

/**
 * Built-in deterministic scorers (spec: eval-framework). All of them are
 * TRAJECTORY-level: they read the ordered steps, not just the final
 * outcome — output-only evaluation misses mid-run corruption.
 */

function scorer(id: string, fn: CodeScorer['score']): CodeScorer {
  return { id, kind: 'code', rubric_hash: rubricHash(fn.toString()), score: fn };
}

/** 1 when the task completed — the output-only baseline, kept for contrast. */
export const taskCompleted = scorer('task_completed', (t) => ({ value: t.completed ? 1 : 0 }));

/** 1 only when the task completed AND no step errored — catches "right answer via broken path". */
export const cleanTrajectory = scorer('clean_trajectory', (t) => {
  const failedSteps = t.steps.filter((s) => s.event === 'step_executed' && s.status && s.status !== 'ok');
  if (!t.completed) return { value: 0, label: 'not_completed' };
  return failedSteps.length === 0
    ? { value: 1 }
    : { value: 0, label: `failed_steps:${failedSteps.length}` };
});

/** Penalizes retry loops: 1 - (retried steps / steps), floor 0. */
export const lowRetryChurn = scorer('low_retry_churn', (t) => {
  const steps = t.steps.filter((s) => s.event === 'step_executed');
  if (steps.length === 0) return { value: 1, label: 'no_steps' };
  const retries = steps.filter((s) => s.retry_of_step_id && s.retry_of_step_id !== '').length;
  return { value: Math.max(0, 1 - retries / steps.length) };
});

/** 1 when no human had to intervene (the autonomy signal as a scorer). */
export const noHumanIntervention = scorer('no_human_intervention', (t) => {
  const touched = t.steps.some((s) =>
    ['handoff_to_human', 'human_edited', 'human_overrode'].includes(s.event),
  );
  return { value: touched ? 0 : 1 };
});

export const BUILTIN_SCORERS: CodeScorer[] = [
  taskCompleted,
  cleanTrajectory,
  lowRetryChurn,
  noHumanIntervention,
];

export function runCodeScorer(
  s: CodeScorer,
  trajectory: Trajectory,
  versions: VersionTuple,
): EvalScore {
  const { value, label } = s.score(trajectory);
  return {
    trace_ref: { task_id: trajectory.task_id, run_id: trajectory.run_id },
    evaluator: { id: s.id, kind: 'code', rubric_hash: s.rubric_hash },
    versions,
    value,
    ...(label ? { label } : {}),
  };
}

/**
 * Runs an LLM judge through the executor seam and stamps the evaluator
 * identity + observability fields. Judge scores are directional: they
 * carry their judge model and rubric hash, and no `q_` citation — by
 * construction they cannot masquerade as measured numbers.
 */
export async function runJudge(
  executor: JudgeExecutor,
  args: { id: string; rubric: string; trajectory: Trajectory; versions: VersionTuple },
): Promise<EvalScore> {
  const started = Date.now();
  const verdict = await executor.judge({ rubric: args.rubric, trajectory: args.trajectory });
  const evaluator: EvaluatorIdentity = {
    id: args.id,
    kind: 'judge',
    rubric_hash: rubricHash(args.rubric),
    judge_model: verdict.judge_model,
  };
  return {
    trace_ref: { task_id: args.trajectory.task_id, run_id: args.trajectory.run_id },
    evaluator,
    versions: args.versions,
    value: verdict.value,
    reasoning: verdict.reasoning,
    judge_latency_ms: Date.now() - started,
    ...(verdict.tokens !== undefined ? { judge_tokens: verdict.tokens } : {}),
  };
}

/** Deterministic per-tenant sampling decision for online scoring. */
export function shouldSample(traceKey: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  let h = 0;
  for (let i = 0; i < traceKey.length; i++) h = (h * 31 + traceKey.charCodeAt(i)) >>> 0;
  return h / 0xffffffff < rate;
}

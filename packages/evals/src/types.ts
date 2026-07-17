import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * The eval framework's contract (spec: eval-framework).
 *
 * Two signal classes, never conflated:
 * - CODE scorers are deterministic — same inputs, same score, no model.
 * - JUDGE scorers are LLM-as-judge — directional, carrying their judge
 *   model + rubric hash, and excluded from the `q_<hash>` citation
 *   contract by construction (a judge score has no query id and never
 *   masquerades as a measured number).
 *
 * Every score carries the FULL version tuple captured at score time —
 * without it, drift is uninterpretable (the single most common failure
 * mode the research found).
 */

export const versionTupleSchema = z.object({
  prompt_version: z.string().min(1),
  model_version: z.string().min(1),
  agent_version: z.string().min(1),
  dataset_version: z.string().min(1).nullish(),
});
export type VersionTuple = z.infer<typeof versionTupleSchema>;

export const evaluatorIdentitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['code', 'judge', 'human']),
  /** Content hash of the rubric/scorer source — a rubric change is a new evaluator version. */
  rubric_hash: z.string().min(1),
  judge_model: z.string().min(1).nullish(),
});
export type EvaluatorIdentity = z.infer<typeof evaluatorIdentitySchema>;

export const evalScoreSchema = z.object({
  trace_ref: z.object({ task_id: z.string().min(1), run_id: z.string().min(1) }),
  evaluator: evaluatorIdentitySchema,
  versions: versionTupleSchema,
  value: z.number().min(0).max(1),
  label: z.string().min(1).nullish(),
  reasoning: z.string().nullish(),
  /** Judge runs are themselves observable: cost/latency of the judgment. */
  judge_latency_ms: z.number().nonnegative().nullish(),
  judge_tokens: z.number().nonnegative().nullish(),
});
export type EvalScore = z.infer<typeof evalScoreSchema>;

export function rubricHash(source: string): string {
  return `rb_${createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
}

/** One step of a run trajectory, as reconstructed from the events. */
export interface TrajectoryStep {
  event: string;
  tool_name?: string;
  status?: string;
  retry_of_step_id?: string;
}

export interface Trajectory {
  task_id: string;
  run_id: string;
  completed: boolean;
  steps: TrajectoryStep[];
}

/** Deterministic code scorer over a full trajectory (never output-only). */
export interface CodeScorer {
  id: string;
  kind: 'code';
  rubric_hash: string;
  score(trajectory: Trajectory): { value: number; label?: string };
}

/**
 * The judge seam (like the analysis QueryExecutor): tests bind a fixture,
 * production binds a real model call. The runner records latency/tokens so
 * judge runs are observable, and stamps the evaluator identity on every
 * score.
 */
export interface JudgeExecutor {
  judge(args: { rubric: string; trajectory: Trajectory }): Promise<{
    value: number;
    reasoning: string;
    judge_model: string;
    tokens?: number;
  }>;
}

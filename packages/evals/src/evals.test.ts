import { describe, expect, it } from 'vitest';
import {
  BUILTIN_SCORERS,
  cleanTrajectory,
  evaluateGate,
  judgeAgreement,
  lowRetryChurn,
  noHumanIntervention,
  runCodeScorer,
  runJudge,
  runSuite,
  shouldSample,
  taskCompleted,
} from './index.js';
import type { JudgeExecutor, Trajectory } from './types.js';

const versions = { prompt_version: 'p1', model_version: 'claude-opus-4-8', agent_version: 'a@1' };

const cleanRun: Trajectory = {
  task_id: 't1',
  run_id: 'r1',
  completed: true,
  steps: [
    { event: 'step_executed', tool_name: 'crm', status: 'ok' },
    { event: 'step_executed', tool_name: 'mail', status: 'ok' },
  ],
};

// The trajectory-vs-output case: final output fine, step 1 errored then retried.
const corruptedButCompleted: Trajectory = {
  task_id: 't2',
  run_id: 'r1',
  completed: true,
  steps: [
    { event: 'step_executed', tool_name: 'crm', status: 'error' },
    { event: 'step_executed', tool_name: 'crm', status: 'ok', retry_of_step_id: 's1' },
  ],
};

describe('trajectory-level code scorers', () => {
  it('output-only passes a corrupted trajectory; trajectory scoring catches it', () => {
    // The exact failure mode the spec names: output-only misses mid-run corruption.
    expect(taskCompleted.score(corruptedButCompleted).value).toBe(1);
    expect(cleanTrajectory.score(corruptedButCompleted).value).toBe(0);
    expect(cleanTrajectory.score(cleanRun).value).toBe(1);
  });

  it('retry churn and human intervention score deterministically', () => {
    expect(lowRetryChurn.score(corruptedButCompleted).value).toBe(0.5);
    expect(noHumanIntervention.score(cleanRun).value).toBe(1);
    expect(
      noHumanIntervention.score({ ...cleanRun, steps: [...cleanRun.steps, { event: 'human_overrode' }] }).value,
    ).toBe(0);
  });

  it('every score carries the full version tuple and evaluator identity', () => {
    const score = runCodeScorer(cleanTrajectory, cleanRun, versions);
    expect(score.versions).toMatchObject(versions);
    expect(score.evaluator).toMatchObject({ id: 'clean_trajectory', kind: 'code' });
    expect(score.evaluator.rubric_hash).toMatch(/^rb_/);
    expect(score.trace_ref).toEqual({ task_id: 't1', run_id: 'r1' });
    // No q_ citation surface exists on a score — it is a distinct signal class.
    expect(JSON.stringify(score)).not.toMatch(/"q_[0-9a-f]/);
  });
});

describe('LLM judge (through the executor seam)', () => {
  const fixtureJudge: JudgeExecutor = {
    judge: async () => ({ value: 0.7, reasoning: 'grounded but verbose', judge_model: 'claude-opus-4-8', tokens: 412 }),
  };

  it('stamps judge identity, rubric hash, and observability fields', async () => {
    const score = await runJudge(fixtureJudge, {
      id: 'groundedness',
      rubric: 'Is the answer grounded in the tool results?',
      trajectory: cleanRun,
      versions,
    });
    expect(score.evaluator).toMatchObject({ kind: 'judge', judge_model: 'claude-opus-4-8' });
    expect(score.value).toBe(0.7);
    expect(score.reasoning).toContain('grounded');
    expect(score.judge_tokens).toBe(412);
    expect(score.judge_latency_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('suites and the CI gate', () => {
  const dataset = {
    dataset_id: 'ds_regressions',
    version: 'v3',
    cases: [
      { case_id: 'c1', trajectory: cleanRun },
      { case_id: 'c2', trajectory: corruptedButCompleted },
    ],
  };

  it('a regressing dataset fails the gate with the failing scorer and cases named', () => {
    const result = runSuite(dataset, BUILTIN_SCORERS, versions);
    expect(result.scores.every((s) => s.versions.dataset_version === 'v3')).toBe(true);
    const gate = evaluateGate(result, [
      { scorer_id: 'task_completed', min_mean: 1 },
      { scorer_id: 'clean_trajectory', min_mean: 0.9 },
    ]);
    expect(gate.pass).toBe(false);
    const failure = gate.failures.find((f) => f.scorer_id === 'clean_trajectory');
    expect(failure?.failing_cases).toContain('c2');
    // And a healthy threshold set passes.
    expect(evaluateGate(result, [{ scorer_id: 'task_completed', min_mean: 1 }]).pass).toBe(true);
  });
});

describe('judge calibration + sampling', () => {
  it('computes judge-vs-human agreement over paired traces', () => {
    const mk = (kind: 'judge' | 'human', task: string, value: number) => ({
      trace_ref: { task_id: task, run_id: 'r1' },
      evaluator: { id: 'g', kind, rubric_hash: 'rb_x' },
      versions,
      value,
    });
    const { pairs, agreement } = judgeAgreement([
      mk('judge', 't1', 0.9), mk('human', 't1', 1.0), // agree
      mk('judge', 't2', 0.2), mk('human', 't2', 0.9), // disagree
      mk('judge', 't3', 0.5), // unpaired — ignored
    ]);
    expect(pairs).toBe(2);
    expect(agreement).toBe(0.5);
    expect(judgeAgreement([]).agreement).toBeNull(); // no data is null, never a fabricated 100%
  });

  it('sampling is deterministic per trace and honors the rate bounds', () => {
    expect(shouldSample('any', 1)).toBe(true);
    expect(shouldSample('any', 0)).toBe(false);
    expect(shouldSample('trace-x', 0.5)).toBe(shouldSample('trace-x', 0.5));
  });
});

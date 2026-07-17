import { beforeAll, describe, expect, it } from 'vitest';
import { createPgliteExecutor } from './db/pglite.js';
import { migrate } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { EvalsStore } from './evals-store.js';
import { RegistryStore, ValidationError } from './store.js';
import type { SqlExecutor } from './db/executor.js';

const versions = { prompt_version: 'p1', model_version: 'claude-opus-4-8', agent_version: 'a@1' };
const score = (kind: 'code' | 'judge' | 'human', task: string, value: number) => ({
  trace_ref: { task_id: task, run_id: 'r1' },
  evaluator: { id: 'groundedness', kind, rubric_hash: 'rb_1234567890abcdef', ...(kind === 'judge' ? { judge_model: 'claude-opus-4-8' } : {}) },
  versions,
  value,
  ...(kind === 'judge' ? { reasoning: 'directional judgment', judge_latency_ms: 812, judge_tokens: 400 } : {}),
});

describe('EvalsStore (spec: eval-framework)', () => {
  let db: SqlExecutor;
  let evals: EvalsStore;
  let tenantId: string;

  beforeAll(async () => {
    db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    evals = new EvalsStore(db);
    tenantId = (await new RegistryStore(db).createTenant('Eval Tenant')).tenantId;
  });

  it('stores scores with the full version tuple and reads them back typed', async () => {
    await evals.recordScore(tenantId, score('judge', 'task_1', 0.7));
    await evals.recordScore(tenantId, score('human', 'task_1', 0.9));
    const scores = await evals.listScores(tenantId, { task_id: 'task_1' });
    expect(scores).toHaveLength(2);
    const judge = scores.find((s) => s.evaluator.kind === 'judge')!;
    expect(judge.versions).toMatchObject(versions);
    expect(judge.evaluator.judge_model).toBe('claude-opus-4-8');
    expect(judge.reasoning).toContain('directional');
  });

  it('rejects a score without its version tuple — never silently defaulted', async () => {
    const missing = { ...score('code', 'task_2', 1), versions: { prompt_version: 'p1' } };
    await expect(evals.recordScore(tenantId, missing)).rejects.toThrow(ValidationError);
  });

  it('promotes a trajectory into a versioned dataset (version bumps per case)', async () => {
    const { dataset_id, version } = await evals.createDataset(tenantId, 'regressions');
    expect(version).toBe('v1');
    const added = await evals.addCase(tenantId, dataset_id, {
      case_id: 'c1',
      trajectory: { task_id: 'task_1', run_id: 'r1', completed: true, steps: [{ event: 'step_executed', status: 'ok' }] },
    });
    expect(added).toBe(true);
    const dataset = await evals.getDataset(tenantId, dataset_id);
    expect(dataset).toMatchObject({ version: 'v2' });
    expect((dataset!.cases as unknown[]).length).toBe(1);
    expect(await evals.addCase(tenantId, 'ds_missing', { case_id: 'x', trajectory: { task_id: 't', run_id: 'r', completed: true, steps: [] } })).toBe(false);
  });

  it('computes judge-vs-human agreement from stored scores', async () => {
    const { pairs, agreement } = await evals.agreement(tenantId, 'groundedness');
    expect(pairs).toBe(1);
    expect(agreement).toBe(1); // 0.7 vs 0.9 within the 0.25 tolerance
  });
});

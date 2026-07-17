import { randomUUID } from 'node:crypto';
import { evalScoreSchema, judgeAgreement, type EvalScore } from '@toqar/evals';
import { z } from 'zod';
import type { SqlExecutor, SqlRunner } from './db/executor.js';
import { ValidationError } from './store.js';

/**
 * Eval storage (spec: eval-framework), tenant-scoped like everything else:
 * every method runs inside tenantTransaction (RLS-bound). Scores are
 * append-only rows carrying the FULL version tuple + evaluator identity —
 * a score without its versions is uninterpretable and is rejected at the
 * schema boundary, not silently defaulted.
 */

const datasetCaseSchema = z.object({
  case_id: z.string().min(1),
  trajectory: z.object({
    task_id: z.string().min(1),
    run_id: z.string().min(1),
    completed: z.boolean(),
    steps: z.array(z.record(z.unknown())),
  }),
});

export class EvalsStore {
  constructor(private readonly db: SqlExecutor) {}

  private scoped<T>(tenantId: string, fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
    return this.db.tenantTransaction(tenantId, fn);
  }

  async recordScore(tenantId: string, value: unknown): Promise<{ score_id: string }> {
    const parsed = evalScoreSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const score = parsed.data;
    const scoreId = `es_${randomUUID()}`;
    await this.scoped(tenantId, (tx) =>
      tx.query(
        `INSERT INTO eval_scores (id, tenant_id, task_id, run_id, evaluator_id, evaluator_kind, rubric_hash, judge_model, prompt_version, model_version, agent_version, dataset_version, value, label, reasoning, judge_latency_ms, judge_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          scoreId,
          tenantId,
          score.trace_ref.task_id,
          score.trace_ref.run_id,
          score.evaluator.id,
          score.evaluator.kind,
          score.evaluator.rubric_hash,
          score.evaluator.judge_model ?? null,
          score.versions.prompt_version,
          score.versions.model_version,
          score.versions.agent_version,
          score.versions.dataset_version ?? null,
          score.value,
          score.label ?? null,
          score.reasoning ?? null,
          score.judge_latency_ms ?? null,
          score.judge_tokens ?? null,
        ],
      ),
    );
    return { score_id: scoreId };
  }

  async listScores(
    tenantId: string,
    filter: { task_id?: string; evaluator_id?: string } = {},
    limit = 200,
  ): Promise<EvalScore[]> {
    return this.scoped(tenantId, async (tx) => {
      const clauses = ['tenant_id = $1'];
      const params: unknown[] = [tenantId];
      if (filter.task_id) {
        params.push(filter.task_id);
        clauses.push(`task_id = $${params.length}`);
      }
      if (filter.evaluator_id) {
        params.push(filter.evaluator_id);
        clauses.push(`evaluator_id = $${params.length}`);
      }
      params.push(limit);
      const { rows } = await tx.query(
        `SELECT * FROM eval_scores WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT $${params.length}`,
        params,
      );
      return rows.map((r) => ({
        trace_ref: { task_id: String(r.task_id), run_id: String(r.run_id) },
        evaluator: {
          id: String(r.evaluator_id),
          kind: r.evaluator_kind as 'code' | 'judge' | 'human',
          rubric_hash: String(r.rubric_hash),
          ...(r.judge_model ? { judge_model: String(r.judge_model) } : {}),
        },
        versions: {
          prompt_version: String(r.prompt_version),
          model_version: String(r.model_version),
          agent_version: String(r.agent_version),
          ...(r.dataset_version ? { dataset_version: String(r.dataset_version) } : {}),
        },
        value: Number(r.value),
        ...(r.label ? { label: String(r.label) } : {}),
        ...(r.reasoning ? { reasoning: String(r.reasoning) } : {}),
      }));
    });
  }

  /** Promote a production trace into a versioned dataset in one action. */
  async createDataset(tenantId: string, name: string): Promise<{ dataset_id: string; version: string }> {
    if (!name.trim()) throw new ValidationError('dataset name required');
    const datasetId = `ds_${randomUUID()}`;
    await this.scoped(tenantId, (tx) =>
      tx.query('INSERT INTO eval_datasets (id, tenant_id, name, version) VALUES ($1, $2, $3, $4)', [
        datasetId,
        tenantId,
        name,
        'v1',
      ]),
    );
    return { dataset_id: datasetId, version: 'v1' };
  }

  async addCase(tenantId: string, datasetId: string, value: unknown): Promise<boolean> {
    const parsed = datasetCaseSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT version FROM eval_datasets WHERE tenant_id = $1 AND id = $2',
        [tenantId, datasetId],
      );
      if (!rows.length) return false;
      await tx.query(
        'INSERT INTO eval_dataset_cases (tenant_id, dataset_id, case_id, trajectory) VALUES ($1, $2, $3, $4)',
        [tenantId, datasetId, parsed.data.case_id, JSON.stringify(parsed.data.trajectory)],
      );
      // Adding a case bumps the dataset version — datasets are versioned so
      // dataset_version in the score tuple stays meaningful.
      const next = `v${Number(String(rows[0]!.version).slice(1)) + 1}`;
      await tx.query('UPDATE eval_datasets SET version = $3 WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        datasetId,
        next,
      ]);
      return true;
    });
  }

  async getDataset(tenantId: string, datasetId: string): Promise<Record<string, unknown> | null> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id, name, version FROM eval_datasets WHERE tenant_id = $1 AND id = $2',
        [tenantId, datasetId],
      );
      if (!rows.length) return null;
      const cases = await tx.query(
        'SELECT case_id, trajectory FROM eval_dataset_cases WHERE tenant_id = $1 AND dataset_id = $2 ORDER BY id',
        [tenantId, datasetId],
      );
      return {
        dataset_id: rows[0]!.id,
        name: rows[0]!.name,
        version: rows[0]!.version,
        cases: cases.rows.map((c) => ({ case_id: c.case_id, trajectory: c.trajectory })),
      };
    });
  }

  /** Judge-vs-human calibration over stored scores — surfaced, never hidden. */
  async agreement(tenantId: string, evaluatorId: string): Promise<{ pairs: number; agreement: number | null }> {
    const judge = await this.listScores(tenantId, { evaluator_id: evaluatorId });
    const human = await this.listScores(tenantId);
    return judgeAgreement([...judge, ...human.filter((s) => s.evaluator.kind === 'human')]);
  }
}

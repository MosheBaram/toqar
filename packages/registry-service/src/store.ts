import { createHash, randomUUID } from 'node:crypto';
import {
  registryEntrySchema,
  seamMapSchema,
  trackingPlanSchema,
  type RegistryEntry,
  type SeamMap,
} from '@toqar/registry';
import type { ZodIssue } from 'zod';
import type { SqlExecutor, SqlRunner } from './db/executor.js';
import { defaultTaxonomy } from './taxonomy.js';

/** Payload failed schema validation — maps to HTTP 400. */
export class ValidationError extends Error {
  constructor(readonly issues: ZodIssue[] | string) {
    super(typeof issues === 'string' ? issues : 'validation failed');
    this.name = 'ValidationError';
  }
}

/** Plan conflicts with current registry state — maps to HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface AuditRecord {
  id: number;
  actor: string;
  operation: 'seed' | 'put' | 'add' | 'modify' | 'remove' | 'seam_map' | 'instrument_run';
  /** Registry event name, or the repo for seam-map operations. */
  event: string;
  diff: { before: unknown; after: unknown };
  created_at: string;
}

export interface ApplyResult {
  added: number;
  modified: number;
  removed: number;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

import { z } from 'zod';

const instrumentRunSchema = z.object({
  repo: z.string().min(1),
  pr_url: z.string().min(1).optional(),
  tokens_in: z.number().int().nonnegative().default(0),
  tokens_out: z.number().int().nonnegative().default(0),
  cost_usd: z.number().nonnegative().default(0),
  model: z.string().min(1).nullish(),
  agent_version: z.string().min(1),
});

const runOutcomeSchema = z.enum(['delivered', 'merged', 'edited_then_merged', 'rejected']);

function parseEntry(value: unknown): RegistryEntry {
  const parsed = registryEntrySchema.safeParse(value);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  return parsed.data;
}

export class RegistryStore {
  constructor(private readonly db: SqlExecutor) {}

  /** Creates a tenant and seeds the TOQAR default taxonomy. The token is returned exactly once. */
  async createTenant(name: string): Promise<{ tenantId: string; token: string }> {
    const tenantId = `t_${randomUUID()}`;
    const token = `tok_${randomUUID()}`;
    await this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO tenants (id, name, token_hash) VALUES ($1, $2, $3)', [
        tenantId,
        name,
        hashToken(token),
      ]);
      for (const entry of defaultTaxonomy()) {
        await this.writeEntry(tx, tenantId, entry);
        await this.audit(tx, tenantId, 'system', 'seed', entry.event, null, entry);
      }
    });
    return { tenantId, token };
  }

  async findTenantByToken(token: string): Promise<string | null> {
    const { rows } = await this.db.query('SELECT id FROM tenants WHERE token_hash = $1', [
      hashToken(token),
    ]);
    return (rows[0]?.id as string | undefined) ?? null;
  }

  async listEntries(tenantId: string): Promise<RegistryEntry[]> {
    const { rows } = await this.db.query(
      'SELECT entry FROM registry_entries WHERE tenant_id = $1 ORDER BY event',
      [tenantId],
    );
    return rows.map((r) => parseEntry(r.entry));
  }

  async getEntry(tenantId: string, event: string): Promise<RegistryEntry | null> {
    const { rows } = await this.db.query(
      'SELECT entry FROM registry_entries WHERE tenant_id = $1 AND event = $2',
      [tenantId, event],
    );
    return rows.length ? parseEntry(rows[0]!.entry) : null;
  }

  async putEntry(tenantId: string, value: unknown, actor: string): Promise<RegistryEntry> {
    const entry = parseEntry(value);
    await this.db.transaction(async (tx) => {
      const before = await this.getEntryVia(tx, tenantId, entry.event);
      await this.writeEntry(tx, tenantId, entry);
      await this.audit(tx, tenantId, actor, 'put', entry.event, before, entry);
    });
    return entry;
  }

  /** Hash of the tenant's current registry state (design D5 stale-check). */
  async fingerprint(tenantId: string): Promise<string> {
    const entries = await this.listEntries(tenantId);
    return `fp_${createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16)}`;
  }

  /**
   * Applies a tracking plan atomically (design D4): added inserted,
   * modified replaced, removed set to deprecated. Any conflict rejects
   * the whole plan; `removed` never deletes.
   */
  async applyPlan(
    tenantId: string,
    planValue: unknown,
    fingerprint: string,
    actor: string,
  ): Promise<ApplyResult> {
    const parsed = trackingPlanSchema.safeParse(planValue);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const plan = parsed.data;

    const current = await this.fingerprint(tenantId);
    if (fingerprint !== current) {
      throw new ConflictError(
        `stale fingerprint: plan was computed against ${fingerprint}, registry is at ${current} — re-run the diff`,
      );
    }

    return this.db.transaction(async (tx) => {
      for (const planned of plan.added) {
        if (await this.getEntryVia(tx, tenantId, planned.event)) {
          throw new ConflictError(`added event already exists: ${planned.event}`);
        }
        const entry = parseEntry(planned);
        await this.writeEntry(tx, tenantId, entry);
        await this.audit(tx, tenantId, actor, 'add', entry.event, null, entry);
      }
      for (const planned of plan.modified) {
        const before = await this.getEntryVia(tx, tenantId, planned.event);
        if (!before) {
          throw new ConflictError(`modified event does not exist: ${planned.event}`);
        }
        const entry = parseEntry(planned);
        await this.writeEntry(tx, tenantId, entry);
        await this.audit(tx, tenantId, actor, 'modify', entry.event, before, entry);
      }
      for (const removal of plan.removed) {
        const before = await this.getEntryVia(tx, tenantId, removal.event);
        if (!before) {
          throw new ConflictError(`removed event does not exist: ${removal.event}`);
        }
        const after: RegistryEntry = { ...before, status: 'deprecated' };
        await this.writeEntry(tx, tenantId, after);
        await this.audit(tx, tenantId, actor, 'remove', removal.event, before, after);
      }
      return {
        added: plan.added.length,
        modified: plan.modified.length,
        removed: plan.removed.length,
      };
    });
  }

  /**
   * Persists an instrumentation run's seam map (latest wins per repo) and
   * audits the write — the accumulated-context store (design D3 of the
   * instrumentation-agent change).
   */
  async putSeamMap(tenantId: string, value: unknown, actor: string): Promise<SeamMap> {
    const parsed = seamMapSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const map = parsed.data;
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO repo_context (tenant_id, repo, seam_map, agent_version, produced_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, repo) DO UPDATE
           SET seam_map = $3, agent_version = $4, produced_at = $5, updated_at = now()`,
        [tenantId, map.repo, JSON.stringify(map), map.agent_version, map.produced_at],
      );
      await this.audit(tx, tenantId, actor, 'seam_map', map.repo, null, {
        agent_version: map.agent_version,
        produced_at: map.produced_at,
        seams: map.seams.length,
        frameworks: map.frameworks,
      });
    });
    return map;
  }

  async getSeamMap(tenantId: string, repo: string): Promise<SeamMap | null> {
    const { rows } = await this.db.query(
      'SELECT seam_map FROM repo_context WHERE tenant_id = $1 AND repo = $2',
      [tenantId, repo],
    );
    if (!rows.length) return null;
    const parsed = seamMapSchema.safeParse(rows[0]!.seam_map);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return parsed.data;
  }

  /** Records a delivered instrumentation run — merge rate derives from these. */
  async recordInstrumentRun(
    tenantId: string,
    value: unknown,
    actor: string,
  ): Promise<{ run_id: string }> {
    const parsed = instrumentRunSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const run = parsed.data;
    const runId = `run_${randomUUID()}`;
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO instrument_runs (id, tenant_id, repo, pr_url, tokens_in, tokens_out, cost_usd, model, agent_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          runId,
          tenantId,
          run.repo,
          run.pr_url ?? null,
          run.tokens_in,
          run.tokens_out,
          run.cost_usd,
          run.model ?? null,
          run.agent_version,
        ],
      );
      await this.audit(tx, tenantId, actor, 'instrument_run', run.repo, null, {
        run_id: runId,
        pr_url: run.pr_url ?? null,
        outcome: 'delivered',
      });
    });
    return { run_id: runId };
  }

  async updateRunOutcome(
    tenantId: string,
    runId: string,
    outcomeValue: unknown,
    actor: string,
  ): Promise<boolean> {
    const parsed = runOutcomeSchema.safeParse(outcomeValue);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query(
        'SELECT outcome, repo FROM instrument_runs WHERE tenant_id = $1 AND id = $2',
        [tenantId, runId],
      );
      if (!rows.length) return false;
      await tx.query('UPDATE instrument_runs SET outcome = $3 WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        runId,
        parsed.data,
      ]);
      await this.audit(tx, tenantId, actor, 'instrument_run', String(rows[0]!.repo), {
        run_id: runId,
        outcome: rows[0]!.outcome,
      }, { run_id: runId, outcome: parsed.data });
      return true;
    });
  }

  async listInstrumentRuns(tenantId: string): Promise<{
    runs: Record<string, unknown>[];
    merge_rate: { merged: number; delivered: number };
  }> {
    const { rows } = await this.db.query(
      `SELECT id, repo, pr_url, outcome, tokens_in, tokens_out, cost_usd, model, agent_version, delivered_at
       FROM instrument_runs WHERE tenant_id = $1 ORDER BY delivered_at DESC`,
      [tenantId],
    );
    const merged = rows.filter(
      (r) => r.outcome === 'merged' || r.outcome === 'edited_then_merged',
    ).length;
    return { runs: rows, merge_rate: { merged, delivered: rows.length } };
  }

  async listAudit(tenantId: string, limit = 100): Promise<AuditRecord[]> {
    const { rows } = await this.db.query(
      'SELECT id, actor, operation, event, diff, created_at FROM audit_log WHERE tenant_id = $1 ORDER BY id DESC LIMIT $2',
      [tenantId, limit],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      actor: r.actor as string,
      operation: r.operation as AuditRecord['operation'],
      event: r.event as string,
      diff: r.diff as AuditRecord['diff'],
      created_at: String(r.created_at),
    }));
  }

  private async getEntryVia(
    tx: SqlRunner,
    tenantId: string,
    event: string,
  ): Promise<RegistryEntry | null> {
    const { rows } = await tx.query(
      'SELECT entry FROM registry_entries WHERE tenant_id = $1 AND event = $2',
      [tenantId, event],
    );
    return rows.length ? parseEntry(rows[0]!.entry) : null;
  }

  private async writeEntry(tx: SqlRunner, tenantId: string, entry: RegistryEntry): Promise<void> {
    await tx.query(
      `INSERT INTO registry_entries (tenant_id, event, entry)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, event) DO UPDATE SET entry = $3, updated_at = now()`,
      [tenantId, entry.event, JSON.stringify(entry)],
    );
  }

  private async audit(
    tx: SqlRunner,
    tenantId: string,
    actor: string,
    operation: AuditRecord['operation'],
    event: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await tx.query(
      'INSERT INTO audit_log (tenant_id, actor, operation, event, diff) VALUES ($1, $2, $3, $4, $5)',
      [tenantId, actor, operation, event, JSON.stringify({ before, after })],
    );
  }
}

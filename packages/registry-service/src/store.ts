import { createHash, randomUUID } from 'node:crypto';
import {
  findingSchema,
  registryEntrySchema,
  seamMapSchema,
  trackingPlanSchema,
  validateFindingCitations,
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
  operation: 'seed' | 'put' | 'add' | 'modify' | 'remove' | 'seam_map' | 'instrument_run' | 'finding' | 'autonomy' | 'token' | 'experiment' | 'benchmark' | 'retention';
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

const deliverySchema = z.object({
  channel: z.enum(['slack']),
  status: z.enum(['delivered', 'failed']),
  detail: z.string().optional(),
});

const tokenScopeSchema = z.object({ scope: z.enum(['events:write', 'api:full']) });

const autonomyGrantSchema = z.object({
  level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  granted_by: z.string().min(1),
});

const billingAccountSchema = z.object({
  tier: z.enum(['starter', 'growth']),
  customer_id: z.string().min(1).nullish(),
  subscription_id: z.string().min(1).nullish(),
});

const invoiceSchema = z.object({
  stripe_invoice_id: z.string().min(1),
  amount_usd: z.number().nonnegative(),
  period_start: z.string().datetime({ offset: true }),
  period_end: z.string().datetime({ offset: true }),
});

const MILESTONE_COLUMN = {
  connected: 'connected_at',
  plan_proposed: 'plan_proposed_at',
  plan_approved: 'plan_approved_at',
  first_event: 'first_event_at',
  first_finding: 'first_finding_at',
} as const;

const milestoneSchema = z.object({
  milestone: z.enum(['connected', 'plan_proposed', 'plan_approved', 'first_event', 'first_finding']),
  at: z.string().datetime({ offset: true }),
});

const experimentSchema = z.object({
  hypothesis: z.string().min(1),
  target_metric: z.string().min(1),
  direction: z.enum(['increase', 'decrease']),
  from_finding_id: z.string().min(1).optional(),
  from_query_ids: z.array(z.string()).default([]),
  guardrails: z.array(z.string()).default([]),
  flag_provider: z.enum(['posthog', 'launchdarkly']),
});

const experimentStatusSchema = z.object({
  status: z.enum(['created', 'running', 'concluded', 'stopped']),
  variant_pr_url: z.string().min(1).optional(),
});

const verdictSchema = z.object({
  decision: z.enum(['ship', 'revert', 'inconclusive']),
  effect: z.number(),
  interval: z.object({ lower: z.number(), upper: z.number() }),
  samples: z.object({ control: z.number().int().nonnegative(), variant: z.number().int().nonnegative() }),
  guardrail_outcomes: z.array(z.object({ metric: z.string(), breached: z.boolean() })).default([]),
  query_ids: z.array(z.string()),
});

function parseEntry(value: unknown): RegistryEntry {
  const parsed = registryEntrySchema.safeParse(value);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  return parsed.data;
}

/**
 * RLS is engaged on the served path (spec: tenancy): every tenant-scoped
 * method below runs inside `tenantTransaction` — the non-owner toqar_app
 * role with the tenant GUC bound transaction-locally — so the row-level
 * policies apply to the store's own queries, not only to a test harness.
 * The deliberate owner-run exceptions, each inherently cross-tenant or
 * pre-tenant: `createTenant` (the tenant row does not exist yet),
 * `resolveToken`/`findTenantByToken` (credential lookup by hash across
 * tenants), and `optedInTenants` (the audited benchmarking cohort).
 * The operator plane (OperatorStore) is owner-run by design.
 */
export class RegistryStore {
  constructor(private readonly db: SqlExecutor) {}

  /** Every tenant-scoped operation goes through here — one transaction, RLS bound. */
  private scoped<T>(tenantId: string, fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
    return this.db.tenantTransaction(tenantId, fn);
  }

  /** Creates a tenant and seeds the TOQAR default taxonomy. The token is returned exactly once. Owner-run: the tenant row does not exist yet. */
  async createTenant(name: string): Promise<{ tenantId: string; token: string }> {
    const tenantId = `t_${randomUUID()}`;
    const token = `tok_${randomUUID()}`;
    await this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO tenants (id, name, token_hash) VALUES ($1, $2, $3)', [
        tenantId,
        name,
        hashToken(token),
      ]);
      await tx.query(
        'INSERT INTO tenant_tokens (id, tenant_id, token_hash, prefix, scope) VALUES ($1, $2, $3, $4, $5)',
        [`tk_${randomUUID()}`, tenantId, hashToken(token), token.slice(0, 12), 'api:full'],
      );
      for (const entry of defaultTaxonomy()) {
        await this.writeEntry(tx, tenantId, entry);
        await this.audit(tx, tenantId, 'system', 'seed', entry.event, null, entry);
      }
    });
    return { tenantId, token };
  }

  /** Scope-aware auth resolution; revoked tokens fail everywhere, immediately. Owner-run: lookup by hash is inherently cross-tenant. */
  async resolveToken(token: string): Promise<{ tenantId: string; scope: string } | null> {
    const { rows } = await this.db.query(
      'SELECT tenant_id, scope FROM tenant_tokens WHERE token_hash = $1 AND revoked_at IS NULL',
      [hashToken(token)],
    );
    if (!rows.length) return null;
    return { tenantId: rows[0]!.tenant_id as string, scope: rows[0]!.scope as string };
  }

  async findTenantByToken(token: string): Promise<string | null> {
    return (await this.resolveToken(token))?.tenantId ?? null;
  }

  async issueToken(
    tenantId: string,
    value: unknown,
    actor: string,
  ): Promise<{ token_id: string; token: string; prefix: string }> {
    const parsed = tokenScopeSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const token = `tok_${randomUUID()}`;
    const tokenId = `tk_${randomUUID()}`;
    const prefix = token.slice(0, 12);
    await this.scoped(tenantId, async (tx) => {
      await tx.query(
        'INSERT INTO tenant_tokens (id, tenant_id, token_hash, prefix, scope) VALUES ($1, $2, $3, $4, $5)',
        [tokenId, tenantId, hashToken(token), prefix, parsed.data.scope],
      );
      await this.audit(tx, tenantId, actor, 'token', prefix, null, {
        token_id: tokenId,
        scope: parsed.data.scope,
        action: 'issued',
      });
    });
    return { token_id: tokenId, token, prefix };
  }

  async listTokens(tenantId: string): Promise<Record<string, unknown>[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id AS token_id, prefix, scope, issued_at, revoked_at FROM tenant_tokens WHERE tenant_id = $1 ORDER BY issued_at',
        [tenantId],
      );
      return rows;
    });
  }

  async revokeToken(tenantId: string, tokenId: string, actor: string): Promise<boolean> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT prefix FROM tenant_tokens WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL',
        [tenantId, tokenId],
      );
      if (!rows.length) return false;
      await tx.query(
        'UPDATE tenant_tokens SET revoked_at = now() WHERE tenant_id = $1 AND id = $2',
        [tenantId, tokenId],
      );
      await this.audit(tx, tenantId, actor, 'token', String(rows[0]!.prefix), null, {
        token_id: tokenId,
        action: 'revoked',
      });
      return true;
    });
  }

  async listEntries(tenantId: string): Promise<RegistryEntry[]> {
    return this.scoped(tenantId, (tx) => this.listEntriesVia(tx, tenantId));
  }

  private async listEntriesVia(tx: SqlRunner, tenantId: string): Promise<RegistryEntry[]> {
    const { rows } = await tx.query(
      'SELECT entry FROM registry_entries WHERE tenant_id = $1 ORDER BY event',
      [tenantId],
    );
    return rows.map((r) => parseEntry(r.entry));
  }

  async getEntry(tenantId: string, event: string): Promise<RegistryEntry | null> {
    return this.scoped(tenantId, (tx) => this.getEntryVia(tx, tenantId, event));
  }

  async putEntry(tenantId: string, value: unknown, actor: string): Promise<RegistryEntry> {
    const entry = parseEntry(value);
    await this.scoped(tenantId, async (tx) => {
      const before = await this.getEntryVia(tx, tenantId, entry.event);
      await this.writeEntry(tx, tenantId, entry);
      await this.audit(tx, tenantId, actor, 'put', entry.event, before, entry);
    });
    return entry;
  }

  /** Hash of the tenant's current registry state (design D5 stale-check). */
  async fingerprint(tenantId: string): Promise<string> {
    return this.scoped(tenantId, (tx) => this.fingerprintVia(tx, tenantId));
  }

  private async fingerprintVia(tx: SqlRunner, tenantId: string): Promise<string> {
    const entries = await this.listEntriesVia(tx, tenantId);
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

    return this.scoped(tenantId, async (tx) => {
      const current = await this.fingerprintVia(tx, tenantId);
      if (fingerprint !== current) {
        throw new ConflictError(
          `stale fingerprint: plan was computed against ${fingerprint}, registry is at ${current} — re-run the diff`,
        );
      }

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
    await this.scoped(tenantId, async (tx) => {
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
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT seam_map FROM repo_context WHERE tenant_id = $1 AND repo = $2',
        [tenantId, repo],
      );
      if (!rows.length) return null;
      const parsed = seamMapSchema.safeParse(rows[0]!.seam_map);
      if (!parsed.success) throw new ValidationError(parsed.error.issues);
      return parsed.data;
    });
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
    await this.scoped(tenantId, async (tx) => {
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
    return this.scoped(tenantId, async (tx) => {
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
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        `SELECT id, repo, pr_url, outcome, tokens_in, tokens_out, cost_usd, model, agent_version, delivered_at
         FROM instrument_runs WHERE tenant_id = $1 ORDER BY delivered_at DESC`,
        [tenantId],
      );
      const merged = rows.filter(
        (r) => r.outcome === 'merged' || r.outcome === 'edited_then_merged',
      ).length;
      return { runs: rows, merge_rate: { merged, delivered: rows.length } };
    });
  }

  /**
   * Publishes a finding after schema + citation validation. An uncited
   * number rejects the whole draft into finding_rejections — the prompt
   * regression log (spec: analysis-agent, Uncited-number scenario).
   */
  async publishFinding(
    tenantId: string,
    value: unknown,
    actor: string,
  ): Promise<{ finding_id: string } | { rejected: true; uncited: string[] }> {
    const citations = validateFindingCitations(value);
    if (!citations.ok) {
      await this.scoped(tenantId, (tx) =>
        tx.query('INSERT INTO finding_rejections (tenant_id, reason, draft) VALUES ($1, $2, $3)', [
          tenantId,
          `uncited numbers: ${citations.uncited.join(', ')}`,
          JSON.stringify(value),
        ]),
      );
      return { rejected: true, uncited: citations.uncited };
    }
    const finding = findingSchema.parse(value);
    const findingId = `f_${randomUUID()}`;
    await this.scoped(tenantId, async (tx) => {
      await tx.query('INSERT INTO findings (id, tenant_id, finding) VALUES ($1, $2, $3)', [
        findingId,
        tenantId,
        JSON.stringify(finding),
      ]);
      await this.audit(tx, tenantId, actor, 'finding', finding.headline.slice(0, 120), null, {
        finding_id: findingId,
        layer: finding.layer,
        severity: finding.severity,
      });
    });
    return { finding_id: findingId };
  }

  async listFindings(tenantId: string, limit = 50): Promise<Record<string, unknown>[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id, finding, published_at FROM findings WHERE tenant_id = $1 ORDER BY published_at DESC, id LIMIT $2',
        [tenantId, limit],
      );
      return rows.map((r) => ({
        finding_id: r.id,
        published_at: String(r.published_at),
        ...(r.finding as Record<string, unknown>),
      }));
    });
  }

  async getFinding(tenantId: string, findingId: string): Promise<Record<string, unknown> | null> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id, finding, published_at FROM findings WHERE tenant_id = $1 AND id = $2',
        [tenantId, findingId],
      );
      if (!rows.length) return null;
      const deliveries = await tx.query(
        'SELECT channel, status, detail, attempted_at FROM finding_deliveries WHERE tenant_id = $1 AND finding_id = $2 ORDER BY id DESC',
        [tenantId, findingId],
      );
      return {
        finding_id: rows[0]!.id,
        published_at: String(rows[0]!.published_at),
        ...(rows[0]!.finding as Record<string, unknown>),
        deliveries: deliveries.rows,
      };
    });
  }

  async recordDelivery(
    tenantId: string,
    findingId: string,
    value: unknown,
  ): Promise<boolean> {
    const parsed = deliverySchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id FROM findings WHERE tenant_id = $1 AND id = $2',
        [tenantId, findingId],
      );
      if (!rows.length) return false;
      await tx.query(
        'INSERT INTO finding_deliveries (tenant_id, finding_id, channel, status, detail) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, findingId, parsed.data.channel, parsed.data.status, parsed.data.detail ?? null],
      );
      return true;
    });
  }

  async listFindingRejections(tenantId: string): Promise<Record<string, unknown>[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT reason, draft, created_at FROM finding_rejections WHERE tenant_id = $1 ORDER BY id DESC',
        [tenantId],
      );
      return rows;
    });
  }

  /** The autonomy dial: each rung is an explicit, audited grant. Default 0. */
  async getAutonomy(tenantId: string): Promise<{
    level: number;
    history: Record<string, unknown>[];
  }> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT level, granted_by, granted_at FROM autonomy_grants WHERE tenant_id = $1 ORDER BY id DESC',
        [tenantId],
      );
      return { level: rows.length ? Number(rows[0]!.level) : 0, history: rows };
    });
  }

  async grantAutonomy(tenantId: string, value: unknown, actor: string): Promise<{ level: number }> {
    const parsed = autonomyGrantSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const grant = parsed.data;
    await this.scoped(tenantId, async (tx) => {
      await tx.query(
        'INSERT INTO autonomy_grants (tenant_id, level, granted_by) VALUES ($1, $2, $3)',
        [tenantId, grant.level, grant.granted_by],
      );
      await this.audit(tx, tenantId, actor, 'autonomy', `level_${grant.level}`, null, grant);
    });
    return { level: grant.level };
  }

  /** Creates an experiment (spec: experiment-plane) with its cited premise. */
  async createExperiment(tenantId: string, value: unknown, actor: string): Promise<{ experiment_id: string }> {
    const parsed = experimentSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const experimentId = `exp_${randomUUID()}`;
    await this.scoped(tenantId, async (tx) => {
      await tx.query('INSERT INTO experiments (id, tenant_id, experiment) VALUES ($1, $2, $3)', [
        experimentId,
        tenantId,
        JSON.stringify(parsed.data),
      ]);
      await this.audit(tx, tenantId, actor, 'experiment', experimentId, null, {
        action: 'created',
        target_metric: parsed.data.target_metric,
      });
    });
    return { experiment_id: experimentId };
  }

  async updateExperiment(tenantId: string, id: string, value: unknown, actor: string): Promise<boolean> {
    const parsed = experimentStatusSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query('SELECT status FROM experiments WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
      if (!rows.length) return false;
      await tx.query(
        'UPDATE experiments SET status = $3, variant_pr_url = COALESCE($4, variant_pr_url), updated_at = now() WHERE tenant_id = $1 AND id = $2',
        [tenantId, id, parsed.data.status, parsed.data.variant_pr_url ?? null],
      );
      await this.audit(tx, tenantId, actor, 'experiment', id, { status: rows[0]!.status }, { action: 'transition', status: parsed.data.status });
      return true;
    });
  }

  async writeVerdict(tenantId: string, id: string, value: unknown, actor: string): Promise<boolean> {
    const parsed = verdictSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query('SELECT id FROM experiments WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
      if (!rows.length) return false;
      await tx.query(
        `INSERT INTO experiment_verdicts (experiment_id, tenant_id, verdict) VALUES ($1, $2, $3)
         ON CONFLICT (experiment_id) DO UPDATE SET verdict = $3, decided_at = now()`,
        [id, tenantId, JSON.stringify(parsed.data)],
      );
      await tx.query("UPDATE experiments SET status = 'concluded', updated_at = now() WHERE tenant_id = $1 AND id = $2", [tenantId, id]);
      await this.audit(tx, tenantId, actor, 'experiment', id, null, { action: 'verdict', decision: parsed.data.decision });
      return true;
    });
  }

  async listExperiments(tenantId: string): Promise<Record<string, unknown>[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id, experiment, status, variant_pr_url, created_at FROM experiments WHERE tenant_id = $1 ORDER BY created_at DESC, id',
        [tenantId],
      );
      return rows.map((r) => ({
        experiment_id: r.id,
        status: r.status,
        variant_pr_url: r.variant_pr_url,
        created_at: String(r.created_at),
        ...(r.experiment as Record<string, unknown>),
      }));
    });
  }

  async getExperiment(tenantId: string, id: string): Promise<Record<string, unknown> | null> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id, experiment, status, variant_pr_url, created_at FROM experiments WHERE tenant_id = $1 AND id = $2',
        [tenantId, id],
      );
      if (!rows.length) return null;
      const verdict = await tx.query(
        'SELECT verdict, decided_at FROM experiment_verdicts WHERE tenant_id = $1 AND experiment_id = $2',
        [tenantId, id],
      );
      return {
        experiment_id: rows[0]!.id,
        status: rows[0]!.status,
        variant_pr_url: rows[0]!.variant_pr_url,
        created_at: String(rows[0]!.created_at),
        ...(rows[0]!.experiment as Record<string, unknown>),
        verdict: verdict.rows.length ? verdict.rows[0]!.verdict : null,
      };
    });
  }

  /**
   * Onboarding milestone timestamps (spec: onboarding). Each milestone
   * maps to a column; the step and time-to-first-finding derive from
   * real timestamps — never a scripted "success".
   */
  async recordMilestone(tenantId: string, value: unknown): Promise<void> {
    const parsed = milestoneSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const column = MILESTONE_COLUMN[parsed.data.milestone];
    await this.scoped(tenantId, (tx) =>
      tx.query(
        `INSERT INTO onboarding_timeline (tenant_id, ${column}) VALUES ($1, $2)
         ON CONFLICT (tenant_id) DO UPDATE SET ${column} = $2`,
        [tenantId, parsed.data.at],
      ),
    );
  }

  async getOnboarding(tenantId: string): Promise<Record<string, unknown>> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT connected_at, plan_proposed_at, plan_approved_at, first_event_at, first_finding_at FROM onboarding_timeline WHERE tenant_id = $1',
        [tenantId],
      );
      const t = (rows[0] ?? {}) as Record<string, string | null>;
      const iso = (v: string | null | undefined) => (v ? new Date(String(v)).toISOString() : null);
      const connected = iso(t.connected_at);
      const firstFinding = iso(t.first_finding_at);
      const step = firstFinding
        ? 'active'
        : t.first_event_at
          ? 'awaiting_first_finding'
          : t.plan_approved_at
            ? 'awaiting_data'
            : t.plan_proposed_at
              ? 'review_plan'
              : connected
                ? 'awaiting_plan'
                : 'connect_repo';
      return {
        connected_at: connected,
        plan_proposed_at: iso(t.plan_proposed_at),
        plan_approved_at: iso(t.plan_approved_at),
        first_event_at: iso(t.first_event_at),
        first_finding_at: firstFinding,
        current_step: step,
        time_to_first_finding_ms:
          connected && firstFinding ? new Date(firstFinding).getTime() - new Date(connected).getTime() : null,
      };
    });
  }

  /** Billing account: tier + Stripe provider references. No card data, ever. */
  async getBilling(tenantId: string): Promise<Record<string, unknown>> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT tier, customer_id, subscription_id FROM billing_accounts WHERE tenant_id = $1',
        [tenantId],
      );
      const a = (rows[0] ?? {}) as Record<string, string | null>;
      return {
        tier: a.tier ?? 'starter',
        customer_id: a.customer_id ?? null,
        subscription_id: a.subscription_id ?? null,
      };
    });
  }

  async setBilling(tenantId: string, value: unknown): Promise<void> {
    const parsed = billingAccountSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    await this.scoped(tenantId, (tx) =>
      tx.query(
        `INSERT INTO billing_accounts (tenant_id, tier, customer_id, subscription_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id) DO UPDATE SET tier = $2, customer_id = $3, subscription_id = $4, updated_at = now()`,
        [tenantId, parsed.data.tier, parsed.data.customer_id ?? null, parsed.data.subscription_id ?? null],
      ),
    );
  }

  async recordInvoice(tenantId: string, value: unknown): Promise<void> {
    const parsed = invoiceSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    await this.scoped(tenantId, (tx) =>
      tx.query(
        'INSERT INTO billing_invoices (tenant_id, stripe_invoice_id, amount_usd, period_start, period_end) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, parsed.data.stripe_invoice_id, parsed.data.amount_usd, parsed.data.period_start, parsed.data.period_end],
      ),
    );
  }

  async listInvoices(tenantId: string): Promise<Record<string, unknown>[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT stripe_invoice_id, amount_usd, period_start, period_end, created_at FROM billing_invoices WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId],
      );
      return rows;
    });
  }

  /** Benchmark opt-in state (spec: benchmarking-optin). Strictly opt-in, audited. */
  async getBenchmarkOptin(tenantId: string): Promise<{ opted_in: boolean }> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query('SELECT opted_in FROM benchmark_optin WHERE tenant_id = $1', [tenantId]);
      return { opted_in: Boolean(rows[0]?.opted_in ?? false) };
    });
  }

  async setBenchmarkOptin(tenantId: string, value: unknown, actor: string): Promise<void> {
    const parsed = z.object({ opted_in: z.boolean() }).safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    await this.scoped(tenantId, async (tx) => {
      await tx.query(
        `INSERT INTO benchmark_optin (tenant_id, opted_in) VALUES ($1, $2)
         ON CONFLICT (tenant_id) DO UPDATE SET opted_in = $2, updated_at = now()`,
        [tenantId, parsed.data.opted_in],
      );
      await this.audit(tx, tenantId, actor, 'benchmark', parsed.data.opted_in ? 'opt_in' : 'opt_out', null, {
        opted_in: parsed.data.opted_in,
      });
    });
  }

  /** Analytics retention window (spec: analytics-storage). Default 365. */
  async getRetentionDays(tenantId: string): Promise<number> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query('SELECT retention_days FROM tenants WHERE id = $1', [
        tenantId,
      ]);
      return rows.length ? Number(rows[0]!.retention_days) : 365;
    });
  }

  async setRetentionDays(tenantId: string, value: unknown, actor: string): Promise<void> {
    const parsed = z.object({ retention_days: z.number().int().min(1).max(3650) }).safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    await this.scoped(tenantId, async (tx) => {
      const before = await tx.query('SELECT retention_days FROM tenants WHERE id = $1', [tenantId]);
      await tx.query('UPDATE tenants SET retention_days = $2 WHERE id = $1', [
        tenantId,
        parsed.data.retention_days,
      ]);
      await this.audit(tx, tenantId, actor, 'retention', `${parsed.data.retention_days}d`, {
        retention_days: before.rows[0]?.retention_days ?? null,
      }, parsed.data);
    });
  }

  /**
   * The one deliberate cross-tenant read: the opted-in cohort. Runs as the
   * owner (not tenant-scoped) — only tenants that explicitly opted in appear.
   */
  async optedInTenants(): Promise<string[]> {
    const { rows } = await this.db.query('SELECT tenant_id FROM benchmark_optin WHERE opted_in = true');
    return rows.map((r) => r.tenant_id as string);
  }

  async listAudit(tenantId: string, limit = 100): Promise<AuditRecord[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
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
    });
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

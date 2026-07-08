import { createHash, randomUUID } from 'node:crypto';
import {
  registryEntrySchema,
  trackingPlanSchema,
  type RegistryEntry,
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
  operation: 'seed' | 'put' | 'add' | 'modify' | 'remove';
  event: string;
  diff: { before: RegistryEntry | null; after: RegistryEntry | null };
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
    before: RegistryEntry | null,
    after: RegistryEntry | null,
  ): Promise<void> {
    await tx.query(
      'INSERT INTO audit_log (tenant_id, actor, operation, event, diff) VALUES ($1, $2, $3, $4, $5)',
      [tenantId, actor, operation, event, JSON.stringify({ before, after })],
    );
  }
}

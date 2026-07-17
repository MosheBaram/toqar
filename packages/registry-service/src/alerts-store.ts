import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SqlExecutor, SqlRunner } from './db/executor.js';
import { ValidationError } from './store.js';

/**
 * Alert configuration + recorded lifecycle (spec: alerting). Tenant-scoped
 * via tenantTransaction like every tenant table. Every evaluation is
 * recorded — fired or not — and every delivery outcome is visible; a
 * failure is a row, never a swallow.
 */

const alertConfigSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['threshold', 'anomaly', 'eval_regression']),
  config: z.record(z.unknown()),
  route: z.object({
    channel: z.enum(['slack', 'webhook']),
    url: z.string().url(),
  }),
});

export interface AlertRow {
  id: string;
  name: string;
  kind: 'threshold' | 'anomaly' | 'eval_regression';
  config: Record<string, unknown>;
  route: { channel: 'slack' | 'webhook'; url: string };
  enabled: boolean;
}

export class AlertsStore {
  constructor(private readonly db: SqlExecutor) {}

  private scoped<T>(tenantId: string, fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
    return this.db.tenantTransaction(tenantId, fn);
  }

  async createAlert(tenantId: string, value: unknown): Promise<{ alert_id: string }> {
    const parsed = alertConfigSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const alertId = `al_${randomUUID()}`;
    await this.scoped(tenantId, (tx) =>
      tx.query('INSERT INTO alerts (id, tenant_id, name, kind, config, route) VALUES ($1, $2, $3, $4, $5, $6)', [
        alertId,
        tenantId,
        parsed.data.name,
        parsed.data.kind,
        JSON.stringify(parsed.data.config),
        JSON.stringify(parsed.data.route),
      ]),
    );
    return { alert_id: alertId };
  }

  async listAlerts(tenantId: string): Promise<AlertRow[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = await tx.query(
        'SELECT id, name, kind, config, route, enabled FROM alerts WHERE tenant_id = $1 ORDER BY created_at',
        [tenantId],
      );
      return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        kind: r.kind as AlertRow['kind'],
        config: r.config as Record<string, unknown>,
        route: r.route as AlertRow['route'],
        enabled: Boolean(r.enabled),
      }));
    });
  }

  async recordEvaluation(
    tenantId: string,
    entry: {
      alert_id: string;
      fired: boolean;
      value?: number;
      query_id?: string;
      delivery_status?: 'delivered' | 'failed' | 'skipped';
      delivery_detail?: string;
    },
  ): Promise<void> {
    await this.scoped(tenantId, (tx) =>
      tx.query(
        'INSERT INTO alert_events (tenant_id, alert_id, fired, value, query_id, delivery_status, delivery_detail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          tenantId,
          entry.alert_id,
          entry.fired,
          entry.value ?? null,
          entry.query_id ?? null,
          entry.delivery_status ?? 'skipped',
          entry.delivery_detail ?? null,
        ],
      ),
    );
  }

  async listAlertEvents(tenantId: string, alertId?: string): Promise<Record<string, unknown>[]> {
    return this.scoped(tenantId, async (tx) => {
      const { rows } = alertId
        ? await tx.query(
            'SELECT alert_id, fired, value, query_id, delivery_status, delivery_detail, evaluated_at FROM alert_events WHERE tenant_id = $1 AND alert_id = $2 ORDER BY id DESC',
            [tenantId, alertId],
          )
        : await tx.query(
            'SELECT alert_id, fired, value, query_id, delivery_status, delivery_detail, evaluated_at FROM alert_events WHERE tenant_id = $1 ORDER BY id DESC',
            [tenantId],
          );
      return rows;
    });
  }
}

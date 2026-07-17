import { beforeAll, describe, expect, it } from 'vitest';
import { createPgliteExecutor } from './db/pglite.js';
import { migrate } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { AlertsStore } from './alerts-store.js';
import { RegistryStore, ValidationError } from './store.js';
import type { SqlExecutor } from './db/executor.js';

describe('AlertsStore (spec: alerting)', () => {
  let db: SqlExecutor;
  let alerts: AlertsStore;
  let tenantId: string;

  beforeAll(async () => {
    db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    alerts = new AlertsStore(db);
    tenantId = (await new RegistryStore(db).createTenant('Alert Tenant')).tenantId;
  });

  it('stores alert configs with routes and lists them back', async () => {
    const { alert_id } = await alerts.createAlert(tenantId, {
      name: 'override spike',
      kind: 'threshold',
      config: { metric: 'override_rate', above: 0.2 },
      route: { channel: 'slack', url: 'https://hooks.slack.com/services/x' },
    });
    const list = await alerts.listAlerts(tenantId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: alert_id, kind: 'threshold', enabled: true });
    await expect(alerts.createAlert(tenantId, { name: '', kind: 'nope' })).rejects.toThrow(ValidationError);
  });

  it('records every evaluation — fired or not — and delivery failures are visible', async () => {
    const [alert] = await alerts.listAlerts(tenantId);
    await alerts.recordEvaluation(tenantId, { alert_id: alert!.id, fired: false });
    await alerts.recordEvaluation(tenantId, {
      alert_id: alert!.id,
      fired: true,
      value: 0.31,
      query_id: 'q_aaaaaaaaaaaaaaaa',
      delivery_status: 'failed',
      delivery_detail: 'delivery failed: 500',
    });
    const events = await alerts.listAlertEvents(tenantId, alert!.id);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ fired: true, delivery_status: 'failed', delivery_detail: 'delivery failed: 500' });
    expect(Number(events[0]!.value)).toBe(0.31);
    expect(events[1]).toMatchObject({ fired: false, delivery_status: 'skipped' });
  });
});

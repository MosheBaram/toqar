import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteExecutor } from './db/pglite.js';
import { migrate } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { RegistryStore, ValidationError } from './store.js';
import type { SqlExecutor } from './db/executor.js';

describe('per-tenant analytics retention (spec: analytics-storage)', () => {
  let db: SqlExecutor;
  let store: RegistryStore;
  let tenantId: string;

  beforeEach(async () => {
    db = await createPgliteExecutor();
    await migrate(db, MIGRATIONS);
    store = new RegistryStore(db);
    tenantId = (await store.createTenant('Acme')).tenantId;
  });

  it('defaults to 365 days', async () => {
    expect(await store.getRetentionDays(tenantId)).toBe(365);
  });

  it('sets a window within bounds and audits the change', async () => {
    await store.setRetentionDays(tenantId, { retention_days: 30 }, 'founder');
    expect(await store.getRetentionDays(tenantId)).toBe(30);
    const audit = await store.listAudit(tenantId);
    const entry = audit.find((a) => a.operation === 'retention');
    expect(entry?.event).toBe('30d');
    expect(entry?.actor).toBe('founder');
  });

  it('rejects out-of-bounds windows', async () => {
    await expect(store.setRetentionDays(tenantId, { retention_days: 0 }, 'x')).rejects.toThrow(ValidationError);
    await expect(store.setRetentionDays(tenantId, { retention_days: 4000 }, 'x')).rejects.toThrow(ValidationError);
    await expect(store.setRetentionDays(tenantId, { retention_days: 1.5 }, 'x')).rejects.toThrow(ValidationError);
  });
});

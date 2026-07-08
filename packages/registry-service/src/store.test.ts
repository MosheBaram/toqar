import { SCHEMA_VERSION, TOQAR_EVENT_NAMES, type TrackingPlan } from '@toqar/registry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { ConflictError, RegistryStore, ValidationError } from './store.js';

const db = await createPgliteExecutor();
const store = new RegistryStore(db);
let tenantId: string;
let token: string;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const created = await store.createTenant('Northbeam AI');
  tenantId = created.tenantId;
  token = created.token;
});

afterAll(async () => {
  await db.close();
});

function productEntry(event: string) {
  return {
    event,
    description: 'A lead replied to an agent-sent message.',
    journey: 'lead_outreach',
    owner_metric: 'verified_success_rate',
    status: 'active' as const,
    since_version: SCHEMA_VERSION,
  };
}

function plan(partial: Partial<TrackingPlan>): TrackingPlan {
  return {
    repo: 'northbeam/sdr-agent',
    generated_at: '2026-07-08T09:00:00.000Z',
    summary: 'Test plan.',
    added: [],
    modified: [],
    removed: [],
    ...partial,
  };
}

describe('createTenant', () => {
  it('seeds exactly the ten TOQAR core events as active', async () => {
    const entries = await store.listEntries(tenantId);
    expect(entries.map((e) => e.event).sort()).toEqual([...TOQAR_EVENT_NAMES].sort());
    expect(entries.every((e) => e.status === 'active')).toBe(true);
    expect(entries.every((e) => e.since_version === SCHEMA_VERSION)).toBe(true);
  });

  it('resolves the tenant from its token, and only its token', async () => {
    expect(await store.findTenantByToken(token)).toBe(tenantId);
    expect(await store.findTenantByToken('tok_wrong')).toBeNull();
  });
});

describe('entry CRUD', () => {
  it('round-trips an entry', async () => {
    await store.putEntry(tenantId, productEntry('reply_received'), 'test');
    const back = await store.getEntry(tenantId, 'reply_received');
    expect(back).toEqual(productEntry('reply_received'));
  });

  it('rejects an invalid entry before touching storage', async () => {
    const bad = { ...productEntry('bad_event'), owner_metric: '' };
    await expect(store.putEntry(tenantId, bad, 'test')).rejects.toBeInstanceOf(ValidationError);
    expect(await store.getEntry(tenantId, 'bad_event')).toBeNull();
  });
});

describe('applyPlan', () => {
  it('applies added and removed atomically and reports counts', async () => {
    const fingerprint = await store.fingerprint(tenantId);
    const result = await store.applyPlan(
      tenantId,
      plan({
        added: [
          { ...productEntry('meeting_booked'), status: 'proposed', code_locations: ['src/a.ts:1'], implementation_notes: 'emit on booking' },
          { ...productEntry('quote_sent'), status: 'proposed', code_locations: ['src/b.ts:2'], implementation_notes: 'emit on send' },
        ],
        removed: [{ event: 'reply_received', reason: 'superseded' }],
      }),
      fingerprint,
      'test',
    );
    expect(result).toEqual({ added: 2, modified: 0, removed: 1 });
    expect((await store.getEntry(tenantId, 'meeting_booked'))?.status).toBe('proposed');
    expect((await store.getEntry(tenantId, 'reply_received'))?.status).toBe('deprecated');
  });

  it('rejects a plan whose modified target does not exist, changing nothing', async () => {
    const before = await store.listEntries(tenantId);
    const fingerprint = await store.fingerprint(tenantId);
    await expect(
      store.applyPlan(
        tenantId,
        plan({
          added: [{ ...productEntry('ghost_add'), code_locations: ['src/c.ts:3'], implementation_notes: 'x' }],
          modified: [{ ...productEntry('does_not_exist'), code_locations: ['src/d.ts:4'], implementation_notes: 'x' }],
        }),
        fingerprint,
        'test',
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await store.getEntry(tenantId, 'ghost_add')).toBeNull();
    expect(await store.listEntries(tenantId)).toEqual(before);
  });

  it('rejects a stale fingerprint', async () => {
    await expect(
      store.applyPlan(tenantId, plan({}), 'fp_stale', 'test'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a structurally invalid plan', async () => {
    const fingerprint = await store.fingerprint(tenantId);
    await expect(
      store.applyPlan(tenantId, { nope: true }, fingerprint, 'test'),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('audit trail', () => {
  it('records one entry per mutation, newest first', async () => {
    const records = await store.listAudit(tenantId);
    // 10 seeded + putEntry + 3 plan mutations (2 added, 1 removed) = 14
    expect(records.length).toBe(14);
    const timestamps = records.map((r) => r.created_at);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);
    const ops = new Set(records.map((r) => r.operation));
    expect(ops).toEqual(new Set(['seed', 'put', 'add', 'remove']));
    const removal = records.find((r) => r.operation === 'remove');
    expect(removal?.event).toBe('reply_received');
    expect((removal?.diff as { after: { status: string } }).after.status).toBe('deprecated');
  });
});

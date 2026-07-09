import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MIGRATIONS } from './db/migrations.js';
import { migrate } from './db/migrate.js';
import { createPgliteExecutor } from './db/pglite.js';
import { RegistryStore } from './store.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let token: string;
const authed = () => ({ authorization: `Bearer ${token}` });

function experiment(overrides: Record<string, unknown> = {}) {
  return {
    hypothesis: 'retry-with-backoff on crm_lookup recovers TSR',
    target_metric: 'task_success_rate',
    direction: 'increase',
    from_finding_id: 'f_source',
    from_query_ids: ['q_1111111111111111'],
    guardrails: ['task_success_rate', 'cost_per_completed_task', 'override_rate'],
    flag_provider: 'posthog',
    ...overrides,
  };
}

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('Experiment Tenant')).token;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('experiment lifecycle', () => {
  let experimentId: string;

  it('creates an experiment citing its premise', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/experiments',
      headers: authed(),
      payload: experiment(),
    });
    expect(res.statusCode).toBe(200);
    experimentId = res.json().experiment_id;
    expect(experimentId).toMatch(/^exp_/);

    const list = await app.inject({ method: 'GET', url: '/v1/experiments', headers: authed() });
    expect(list.json().experiments).toHaveLength(1);
    expect(list.json().experiments[0].status).toBe('created');
    expect(list.json().experiments[0].from_query_ids).toEqual(['q_1111111111111111']);
  });

  it('transitions status with an audit record per step', async () => {
    for (const status of ['running']) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/experiments/${experimentId}`,
        headers: authed(),
        payload: { status, variant_pr_url: 'https://github.com/acme/x/pull/9' },
      });
      expect(res.statusCode).toBe(200);
    }
    const audit = await app.inject({ method: 'GET', url: '/v1/registry/audit', headers: authed() });
    const ops = (audit.json().records as { operation: string }[]).map((r) => r.operation);
    expect(ops.filter((o) => o === 'experiment').length).toBeGreaterThanOrEqual(2); // create + transition
  });

  it('writes a verdict with statistics and concludes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/experiments/${experimentId}/verdict`,
      headers: authed(),
      payload: {
        decision: 'ship',
        effect: 0.061,
        interval: { lower: 0.02, upper: 0.1 },
        samples: { control: 2100, variant: 2100 },
        guardrail_outcomes: [{ metric: 'override_rate', breached: false }],
        query_ids: ['q_2222222222222222'],
      },
    });
    expect(res.statusCode).toBe(200);

    const get = await app.inject({
      method: 'GET',
      url: `/v1/experiments/${experimentId}`,
      headers: authed(),
    });
    const body = get.json();
    expect(body.status).toBe('concluded');
    expect(body.verdict.decision).toBe('ship');
    expect(body.verdict.effect).toBeCloseTo(0.061, 5);
  });

  it('rejects an invalid decision and an unknown experiment', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: `/v1/experiments/${experimentId}/verdict`,
      headers: authed(),
      payload: { decision: 'vibes', effect: 0, interval: { lower: 0, upper: 0 }, samples: { control: 1, variant: 1 }, query_ids: [] },
    });
    expect(bad.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/experiments/exp_nope',
      headers: authed(),
    });
    expect(missing.statusCode).toBe(404);
  });
});

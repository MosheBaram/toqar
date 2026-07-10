import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { monitorExperiment, startExperiment, type ExperimentClient, type Hypothesis } from './agent.js';

/**
 * End-to-end over the real registry service: finding → hypothesis → variant
 * PR (level 2) → sequential verdict → registry record → experiment finding.
 * The whole loop through actual HTTP, no mocks of the backend.
 */

const db = await createPgliteExecutor();
const app = buildApp(db);
let apiUrl: string;
let token: string;

/** The production-shaped client: a thin HTTP wrapper over the registry API. */
function httpClient(base: string, tok: string): ExperimentClient {
  const headers = { authorization: `Bearer ${tok}`, 'content-type': 'application/json' };
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  };
  return {
    async getAutonomyLevel() {
      return ((await call('/v1/autonomy')) as { level: number }).level;
    },
    async createExperiment(exp) {
      return (await call('/v1/experiments', { method: 'POST', body: JSON.stringify(exp) })) as { experiment_id: string };
    },
    async updateExperiment(id, status) {
      await call(`/v1/experiments/${id}`, { method: 'PATCH', body: JSON.stringify(status) });
    },
    async writeVerdict(id, verdict) {
      await call(`/v1/experiments/${id}/verdict`, { method: 'POST', body: JSON.stringify(verdict) });
    },
    async publishFinding(finding) {
      return (await call('/v1/findings', { method: 'POST', body: JSON.stringify(finding) })) as { finding_id: string };
    },
  };
}

const hypothesis: Hypothesis = {
  hypothesis: 'retry-with-backoff on crm_lookup recovers TSR',
  target_metric: 'task_success_rate',
  direction: 'increase',
  from_finding_id: 'f_source',
  from_query_ids: ['q_1111111111111111'],
  guardrails: ['override_rate'],
  flag_provider: 'posthog',
};

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  const created = await store.createTenant('Experiment E2E Tenant');
  token = created.token;
  // grant level 2 so experiment PRs are permitted
  await store.grantAutonomy(created.tenantId, { level: 2, granted_by: 'e2e' }, 'e2e');
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  apiUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('experiment loop end-to-end', () => {
  it('runs finding → hypothesis → PR → verdict → registry → finding', async () => {
    const client = httpClient(apiUrl, token);

    const started = await startExperiment({
      client,
      hypothesis,
      assembleVariantPr: async () => ({ branch: 'analytics/exp', prUrl: 'https://github.com/acme/x/pull/9' }),
    });
    expect(started.status).toBe('running');
    if (started.status !== 'running') return;

    const monitored = await monitorExperiment({
      client,
      experimentId: started.experimentId,
      targetMetric: 'task_success_rate',
      direction: 'increase',
      queryIds: { target: 'q_2222222222222222', guardrails: { override_rate: 'q_3333333333333333' } },
      observations: {
        target: {
          control: Array.from({ length: 2000 }, (_, i) => (i % 2 ? 1 : 0)),
          variant: Array.from({ length: 2000 }, (_, i) => (i % 100 < 62 ? 1 : 0)),
        },
        guardrails: {
          override_rate: {
            control: Array.from({ length: 2000 }, (_, i) => (i % 100 < 6 ? 1 : 0)),
            variant: Array.from({ length: 2000 }, (_, i) => (i % 100 < 6 ? 1 : 0)),
          },
        },
      },
    });
    expect(monitored.status).toBe('concluded');

    // registry has the concluded experiment with its verdict
    const exp = await fetch(`${apiUrl}/v1/experiments/${started.experimentId}`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json() as Promise<{ status: string; verdict: { decision: string } }>);
    expect(exp.status).toBe('concluded');
    expect(exp.verdict.decision).toBe('ship');

    // the experiment finding is in the feed
    const findings = await fetch(`${apiUrl}/v1/findings`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json() as Promise<{ findings: { variant: string }[] }>);
    expect(findings.findings.some((f) => f.variant === 'experiment')).toBe(true);
  });

  it('refuses when autonomy is below level 2', async () => {
    // a fresh tenant defaults to level 0
    const store = new RegistryStore(db);
    const lowTenant = await store.createTenant('Low Autonomy Tenant');
    const client = httpClient(apiUrl, lowTenant.token);
    const result = await startExperiment({
      client,
      hypothesis,
      assembleVariantPr: async () => ({ branch: 'x', prUrl: 'y' }),
    });
    expect(result.status).toBe('refused');
  });
});

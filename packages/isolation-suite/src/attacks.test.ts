import { SCHEMA_VERSION } from '@toqar/registry';
import { BufferedSink, buildCollectorApp, type StreamSink } from '@toqar/collector';
import { buildApp, migrate, MIGRATIONS, OperatorStore, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The standing cross-service adversarial suite (spec: tenancy, design D3):
 * every deployed surface attacked with wrong-tenant, wrong-scope, absent,
 * and revoked credentials. New surfaces MUST register here to ship —
 * this file is the registry of attack coverage.
 */

const db = await createPgliteExecutor();
const registryApp = buildApp(db);
class NullSink implements StreamSink {
  async publish(): Promise<void> {}
}
const collectorApp = buildCollectorApp(db, new BufferedSink(new NullSink(), { capacity: 10 }));
const store = new RegistryStore(db);
const operators = new OperatorStore(db);

let victim: { tenantId: string; token: string };
let attacker: { tenantId: string; token: string };
let attackerEventsToken: string;
let revokedToken: string;
let operatorToken: string;
let victimFindingId: string;
let victimExperimentId: string;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  victim = await store.createTenant('Victim Tenant');
  attacker = await store.createTenant('Attacker Tenant');

  const events = await store.issueToken(attacker.tenantId, { scope: 'events:write' }, 'suite');
  attackerEventsToken = events.token;
  const doomed = await store.issueToken(attacker.tenantId, { scope: 'api:full' }, 'suite');
  revokedToken = doomed.token;
  await store.revokeToken(attacker.tenantId, doomed.token_id, 'suite');

  operatorToken = (await operators.createOperatorToken('suite-operator')).token;

  await store.putSeamMap(
    victim.tenantId,
    {
      repo: 'victim/secret-repo',
      frameworks: ['express'],
      seams: [{ kind: 'task_start', location: 'src/secret.ts:1' }],
      task_taxonomy: ['secret_task'],
      agent_version: 'suite@0',
      produced_at: '2026-07-09T00:00:00.000Z',
    },
    'suite',
  );
  const published = await store.publishFinding(
    victim.tenantId,
    {
      layer: 'T',
      severity: 'info',
      variant: 'anomaly',
      headline: 'Victim-only finding.',
      summary: 'Contains the secret marker victim_secret_marker.',
      metrics: [{ label: 'task_success_rate', value: '71.0%', query_id: 'q_aaaaaaaaaaaaaaaa' }],
      evidence: [{ title: 'victim evidence', query_id: 'q_aaaaaaaaaaaaaaaa' }],
    },
    'suite',
  );
  if ('rejected' in published) throw new Error('fixture finding rejected');
  victimFindingId = published.finding_id;

  const exp = await store.createExperiment(
    victim.tenantId,
    {
      hypothesis: 'victim_secret_marker hypothesis',
      target_metric: 'task_success_rate',
      direction: 'increase',
      from_query_ids: ['q_aaaaaaaaaaaaaaaa'],
      guardrails: ['override_rate'],
      flag_provider: 'posthog',
    },
    'suite',
  );
  victimExperimentId = exp.experiment_id;
});

afterAll(async () => {
  await registryApp.close();
  await collectorApp.close();
  await db.close();
});

interface Surface {
  app: () => FastifyInstance;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: () => string;
  payload?: () => unknown;
}

/** Every tenant-scoped surface. New routes must be added here to ship. */
const SURFACES: Record<string, Surface> = {
  'registry list': { app: () => registryApp, method: 'GET', url: () => '/v1/registry/events' },
  'registry entry': { app: () => registryApp, method: 'GET', url: () => '/v1/registry/events/task_completed' },
  'registry mutate': {
    app: () => registryApp,
    method: 'PUT',
    url: () => '/v1/registry/events/task_completed',
    payload: () => ({ event: 'task_completed', description: 'x', journey: 'x', owner_metric: 'x', status: 'active', since_version: '0.1.0' }),
  },
  'registry apply': { app: () => registryApp, method: 'POST', url: () => '/v1/registry/apply', payload: () => ({ plan: {}, fingerprint: 'fp_x' }) },
  'audit log': { app: () => registryApp, method: 'GET', url: () => '/v1/registry/audit' },
  'seam map': { app: () => registryApp, method: 'GET', url: () => `/v1/registry/seam-map?repo=${encodeURIComponent('victim/secret-repo')}` },
  'instrument runs': { app: () => registryApp, method: 'GET', url: () => '/v1/registry/instrument-runs' },
  findings: { app: () => registryApp, method: 'GET', url: () => '/v1/findings' },
  'finding by id': { app: () => registryApp, method: 'GET', url: () => `/v1/findings/${victimFindingId}` },
  'finding rejections': { app: () => registryApp, method: 'GET', url: () => '/v1/finding-rejections' },
  autonomy: { app: () => registryApp, method: 'GET', url: () => '/v1/autonomy' },
  tokens: { app: () => registryApp, method: 'GET', url: () => '/v1/tokens' },
  experiments: { app: () => registryApp, method: 'GET', url: () => '/v1/experiments' },
  'experiment by id': { app: () => registryApp, method: 'GET', url: () => `/v1/experiments/${victimExperimentId}` },
  onboarding: { app: () => registryApp, method: 'GET', url: () => '/v1/onboarding' },
  billing: { app: () => registryApp, method: 'GET', url: () => '/v1/billing' },
  'billing invoices': { app: () => registryApp, method: 'GET', url: () => '/v1/billing/invoices' },
  'benchmark optin': { app: () => registryApp, method: 'GET', url: () => '/v1/benchmark/optin' },
  'collector events': {
    app: () => collectorApp,
    method: 'POST',
    url: () => '/v1/events',
    payload: () => ({ events: [] }),
  },
  'collector traces': { app: () => collectorApp, method: 'POST', url: () => '/v1/traces', payload: () => ({}) },
  'collector rejections': { app: () => collectorApp, method: 'GET', url: () => '/v1/rejections' },
  'eval scores list': { app: () => registryApp, method: 'GET', url: () => '/v1/evals/scores' },
  'eval scores write': {
    app: () => registryApp,
    method: 'POST',
    url: () => '/v1/evals/scores',
    payload: () => ({
      trace_ref: { task_id: 't', run_id: 'r' },
      evaluator: { id: 'x', kind: 'code', rubric_hash: 'rb_x' },
      versions: { prompt_version: 'p', model_version: 'm', agent_version: 'a' },
      value: 1,
    }),
  },
  'eval datasets': { app: () => registryApp, method: 'POST', url: () => '/v1/evals/datasets', payload: () => ({ name: 'x' }) },
  // Operator plane — the cross-tenant surface. Tenant credentials must be
  // refused here exactly like everywhere else; the positive case (an
  // operator token is admitted) is asserted separately below.
  'operator tenants': { app: () => registryApp, method: 'GET', url: () => '/operator/tenants' },
  'operator drill-down': { app: () => registryApp, method: 'GET', url: () => `/operator/tenants/${victim.tenantId}` },
  'operator rollups': { app: () => registryApp, method: 'GET', url: () => '/operator/rollups' },
  'operator health': { app: () => registryApp, method: 'GET', url: () => '/operator/health' },
};

/** The operator routes, for the operator-scope containment test. */
const OPERATOR_ROUTES = [
  () => '/operator/tenants',
  () => `/operator/tenants/${victim.tenantId}`,
  () => '/operator/rollups',
  () => '/operator/health',
];

const VICTIM_MARKERS = ['victim_secret_marker', 'victim/secret-repo', 'secret_task', 'src/secret.ts'];

async function attack(surface: Surface, token: string | null) {
  return surface.app().inject({
    method: surface.method,
    url: surface.url(),
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    ...(surface.payload ? { payload: surface.payload() as Record<string, unknown> } : {}),
  });
}

describe('adversarial isolation suite', () => {
  it('collector accepts events:write tokens (scoped containment cuts the other way)', async () => {
    const res = await collectorApp.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${attackerEventsToken}` },
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(202);
  });

  it('covers every surface with no token: 401 everywhere', async () => {
    for (const [name, surface] of Object.entries(SURFACES)) {
      const res = await attack(surface, null);
      expect(res.statusCode, `${name} without token`).toBe(401);
    }
  });

  it('revoked tokens fail everywhere', async () => {
    for (const [name, surface] of Object.entries(SURFACES)) {
      const res = await attack(surface, revokedToken);
      expect(res.statusCode, `${name} with revoked token`).toBe(401);
    }
  });

  it("wrong-tenant credentials never return a byte of the victim's data", async () => {
    for (const [name, surface] of Object.entries(SURFACES)) {
      const res = await attack(surface, attacker.token);
      expect([200, 202, 400, 403, 404, 409], `${name} status`).toContain(res.statusCode);
      for (const marker of VICTIM_MARKERS) {
        expect(res.body, `${name} leaked "${marker}"`).not.toContain(marker);
      }
    }
  });

  it('wrong-scope (events:write) tokens are contained on the registry surface', async () => {
    for (const [name, surface] of Object.entries(SURFACES)) {
      if (surface.app() !== registryApp) continue;
      const res = await attack(surface, attackerEventsToken);
      expect(res.statusCode, `${name} with events:write`).toBe(403);
    }
  });

  it('operator routes: tenant tokens refused (403), operator token admitted (200)', async () => {
    for (const url of OPERATOR_ROUTES) {
      // Both tenant scopes are refused — the cross-tenant door is closed to tenants.
      for (const token of [attacker.token, attackerEventsToken]) {
        const refused = await registryApp.inject({ method: 'GET', url: url(), headers: { authorization: `Bearer ${token}` } });
        expect(refused.statusCode, `${url()} with tenant token`).toBe(403);
        for (const marker of VICTIM_MARKERS) {
          expect(refused.body, `${url()} leaked "${marker}"`).not.toContain(marker);
        }
      }
      // Only the operator token reaches them.
      const admitted = await registryApp.inject({ method: 'GET', url: url(), headers: { authorization: `Bearer ${operatorToken}` } });
      expect(admitted.statusCode, `${url()} with operator token`).toBe(200);
    }
  });
});

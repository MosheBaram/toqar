import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { trackingPlanSchema } from '@toqar/registry';
import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelSession } from './model.js';
import { runInstrumentation } from './runner.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/agentic-app-demo');

const db = await createPgliteExecutor();
const app = buildApp(db);
let apiUrl: string;
let token: string;

const scriptedSession: ModelSession = {
  model: 'claude-sonnet-5',
  async send(prompt: string) {
    expect(prompt).toContain('reply_to_lead');
    return {
      text: 'Taxonomy looks right. Suggest verifying task_completed via the email provider ack.',
      usage: { input_tokens: 1200, output_tokens: 300 },
    };
  },
};

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  token = (await store.createTenant('Runner Test Tenant')).token;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  apiUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('runInstrumentation', () => {
  it('maps, proposes, persists the seam map, and stops at the review gate', async () => {
    const before = await readdir(FIXTURE, { recursive: true });

    const result = await runInstrumentation({
      repoPath: FIXTURE,
      repo: 'fixtures/agentic-app-demo',
      apiUrl,
      token,
      session: scriptedSession,
      agentVersion: 'instrumentation-agent@0.1.0',
      now: () => '2026-07-09T13:00:00.000Z',
      rates: { inputPerMTok: 3, outputPerMTok: 15 },
    });

    if (result.status !== 'plan_proposed') throw new Error(`unexpected status ${result.status}`);
    expect(trackingPlanSchema.safeParse(result.plan).success).toBe(true);
    expect(result.plan.modified.length).toBeGreaterThanOrEqual(5);
    expect(result.rendered).toContain('# Tracking Plan');
    expect(result.suggestions).toContain('email provider ack');

    // run record: 1200/1e6*3 + 300/1e6*15 = 0.0036 + 0.0045
    expect(result.runRecord.tokens_in).toBe(1200);
    expect(result.runRecord.tokens_out).toBe(300);
    expect(result.runRecord.cost_usd).toBeCloseTo(0.0081, 6);
    expect(result.runRecord.model).toBe('claude-sonnet-5');

    // seam map persisted server-side
    const res = await fetch(
      `${apiUrl}/v1/registry/seam-map?repo=${encodeURIComponent('fixtures/agentic-app-demo')}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(200);

    // review gate: nothing written into the target repo
    const after = await readdir(FIXTURE, { recursive: true });
    expect(after).toEqual(before);
  });

  it('runs deterministically without a model session (zero cost)', async () => {
    const result = await runInstrumentation({
      repoPath: FIXTURE,
      repo: 'fixtures/agentic-app-demo',
      apiUrl,
      token,
      agentVersion: 'instrumentation-agent@0.1.0',
      now: () => '2026-07-09T13:05:00.000Z',
    });
    if (result.status !== 'plan_proposed') throw new Error(`unexpected status ${result.status}`);
    expect(result.runRecord.cost_usd).toBe(0);
    expect(result.suggestions).toBeUndefined();
  });

  it('refuses an unsupported repo without touching the backend', async () => {
    const result = await runInstrumentation({
      repoPath: resolve(FIXTURE, 'analytics'),
      repo: 'acme/unsupported',
      apiUrl: 'http://127.0.0.1:1',
      token: 'tok_irrelevant',
      agentVersion: 'instrumentation-agent@0.1.0',
      now: () => '2026-07-09T13:10:00.000Z',
    });
    expect(result.status).toBe('unsupported');
    if (result.status === 'unsupported') expect(result.reason).toContain('package.json');
  });
});

import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runOnboard } from './onboard.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/agentic-app-demo');
const db = await createPgliteExecutor();
const app = buildApp(db);
let apiUrl: string;
let token: string;
let repoDir: string;

async function onboarding() {
  return fetch(`${apiUrl}/v1/onboarding`, { headers: { authorization: `Bearer ${token}` } }).then(
    (r) => r.json() as Promise<Record<string, unknown>>,
  );
}

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  token = (await new RegistryStore(db).createTenant('Onboard E2E')).token;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  apiUrl = `http://127.0.0.1:${address.port}`;
  repoDir = await mkdtemp(join(tmpdir(), 'toqar-onboard-'));
  await cp(FIXTURE, repoDir, { recursive: true });
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('runOnboard', () => {
  it('connects, proposes a plan, and records honest milestones (no fabricated finding)', async () => {
    const result = await runOnboard({
      repoPath: repoDir,
      repo: 'acme/sdr-agent',
      apiUrl,
      token,
      now: () => '2026-07-10T10:00:00.000Z',
    });
    expect(result.code).toBe(2); // stopped at the review gate — plan proposed, awaiting approval
    expect(result.output).toContain('# Tracking Plan');

    const state = await onboarding();
    expect(state.connected_at).toBe('2026-07-10T10:00:00.000Z');
    expect(state.current_step).toBe('review_plan');
    // no finding claimed — honest pending
    expect(state.first_finding_at).toBeNull();
    expect(state.time_to_first_finding_ms).toBeNull();
  });

  it('refuses an unsupported repo at connect — no plan milestone recorded', async () => {
    const pyDir = await mkdtemp(join(tmpdir(), 'toqar-onboard-py-'));
    const store = new RegistryStore(db);
    const other = await store.createTenant('Onboard Python');
    const result = await runOnboard({
      repoPath: pyDir, // empty dir, no package.json
      repo: 'acme/py',
      apiUrl,
      token: other.token,
      now: () => '2026-07-10T10:00:00.000Z',
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('unsupported');

    const state = await fetch(`${apiUrl}/v1/onboarding`, {
      headers: { authorization: `Bearer ${other.token}` },
    }).then((r) => r.json() as Promise<Record<string, unknown>>);
    // connected recorded, but never advanced to a proposed plan
    expect(state.plan_proposed_at).toBeNull();
    expect(state.current_step).toBe('awaiting_plan');
  });

  it('requires credentials', async () => {
    const result = await runOnboard({ repoPath: repoDir, apiUrl, token: undefined, now: () => 'x' });
    expect(result.code).toBe(1);
    expect(result.output).toContain('TOQAR_TOKEN');
  });
});

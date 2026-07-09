import { execFile } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInstrument } from './instrument.js';

const run = promisify(execFile);
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/agentic-app-demo');

const db = await createPgliteExecutor();
const app = buildApp(db);
let apiUrl: string;
let token: string;
let repoDir: string;

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  token = (await store.createTenant('Instrument E2E Tenant')).token;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  apiUrl = `http://127.0.0.1:${address.port}`;

  repoDir = await mkdtemp(join(tmpdir(), 'toqar-e2e-'));
  await cp(FIXTURE, repoDir, { recursive: true });
  await run('git', ['init', '-b', 'main'], { cwd: repoDir });
  await run('git', ['add', '-A'], { cwd: repoDir });
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'base'], {
    cwd: repoDir,
  });
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('toqar instrument end-to-end', () => {
  it('first run proposes and stops at the review gate (exit 2)', async () => {
    const result = await runInstrument({
      repoPath: repoDir,
      repo: 'acme/sdr-agent',
      approve: false,
      apiUrl,
      token,
      now: () => '2026-07-09T16:00:00.000Z',
    });
    expect(result.code).toBe(2);
    expect(result.output).toContain('# Tracking Plan');
    expect(result.output).toContain('--approve');
    expect(result.output).toContain('fresh scan');
    expect(result.output).not.toContain(token);
  });

  it('approved run implements, assembles the branch, and records the run', async () => {
    const result = await runInstrument({
      repoPath: repoDir,
      repo: 'acme/sdr-agent',
      approve: true,
      apiUrl,
      token,
      now: () => '2026-07-09T16:05:00.000Z',
    });
    expect(result.code).toBe(0);
    expect(result.output).toContain('analytics/toqar-instrumentation');
    expect(result.output).toContain('run_');
    expect(result.output).toContain('seam map: reused');

    const { stdout: branch } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoDir,
    });
    expect(branch.trim()).toBe('analytics/toqar-instrumentation');

    const runs = await fetch(`${apiUrl}/v1/registry/instrument-runs`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json() as Promise<{ runs: unknown[]; merge_rate: { delivered: number } }>);
    expect(runs.runs).toHaveLength(1);
    expect(runs.merge_rate.delivered).toBe(1);
  });

  it('refuses missing credentials without network', async () => {
    const result = await runInstrument({
      repoPath: repoDir,
      approve: false,
      apiUrl,
      token: undefined,
      now: () => '2026-07-09T16:10:00.000Z',
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('TOQAR_TOKEN');
  });
});

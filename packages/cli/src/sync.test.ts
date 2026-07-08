import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION } from '@toqar/registry';
import { buildApp, migrate, MIGRATIONS, RegistryStore } from '@toqar/registry-service';
import { createPgliteExecutor } from '@toqar/registry-service/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSync, type SyncConfig } from './sync.js';

const db = await createPgliteExecutor();
const app = buildApp(db);
let apiUrl: string;
let token: string;
let dir: string;

function fileEntry(event: string, description = 'Product event.') {
  return {
    event,
    description,
    journey: 'lead_outreach',
    owner_metric: 'verified_success_rate',
    status: 'active',
    since_version: SCHEMA_VERSION,
  };
}

async function writeRegistryFile(entries: unknown[]): Promise<string> {
  const path = join(dir, 'registry.json');
  await writeFile(path, JSON.stringify(entries, null, 2));
  return path;
}

function cfg(overrides: Partial<SyncConfig>): SyncConfig {
  return { apiUrl, token, filePath: join(dir, 'registry.json'), mode: 'diff', ...overrides };
}

beforeAll(async () => {
  await migrate(db, MIGRATIONS);
  const store = new RegistryStore(db);
  token = (await store.createTenant('CLI Test Tenant')).token;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  apiUrl = `http://127.0.0.1:${address.port}`;
  dir = await mkdtemp(join(tmpdir(), 'toqar-cli-'));
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('file validation', () => {
  it('rejects invalid entries and duplicates with their indices, without network', async () => {
    await writeRegistryFile([
      { ...fileEntry('a_event'), journey: undefined },
      fileEntry('b_event'),
      fileEntry('b_event'),
    ]);
    const result = await runSync(cfg({ apiUrl: 'http://127.0.0.1:1' }));
    expect(result.code).toBe(1);
    expect(result.output).toContain('[0]');
    expect(result.output).toContain('journey');
    expect(result.output).toContain('duplicate event');
    expect(result.output).toContain('b_event');
  });
});

describe('credentials', () => {
  it('exits with a setup hint when the token is missing, without network', async () => {
    await writeRegistryFile([fileEntry('a_event')]);
    const result = await runSync(cfg({ token: undefined, apiUrl: 'http://127.0.0.1:1' }));
    expect(result.code).toBe(1);
    expect(result.output).toContain('TOQAR_TOKEN');
  });

  it('never prints the token', async () => {
    await writeRegistryFile([fileEntry('a_event')]);
    const result = await runSync(cfg({}));
    expect(result.output).not.toContain(token);
  });
});

describe('pull, diff, apply round-trip', () => {
  it('pull mirrors the backend registry into the file', async () => {
    const result = await runSync(cfg({ mode: 'pull' }));
    expect(result.code).toBe(0);
    const file = JSON.parse(await readFile(join(dir, 'registry.json'), 'utf8'));
    expect(file).toHaveLength(10);
    const events = file.map((e: { event: string }) => e.event);
    expect(events).toEqual([...events].sort());
  });

  it('reports in-sync after pull', async () => {
    const result = await runSync(cfg({ mode: 'diff' }));
    expect(result.code).toBe(0);
    expect(result.output).toContain('in sync');
  });

  it('shows local additions and modifications as a rendered tracking plan', async () => {
    const file = JSON.parse(await readFile(join(dir, 'registry.json'), 'utf8'));
    file.push(fileEntry('meeting_booked'));
    const idx = file.findIndex((e: { event: string }) => e.event === 'task_completed');
    file[idx] = { ...file[idx], description: 'Changed description.' };
    await writeRegistryFile(file);

    const result = await runSync(cfg({ mode: 'diff' }));
    expect(result.code).toBe(2);
    expect(result.output).toContain('# Tracking Plan');
    expect(result.output).toContain('`meeting_booked`');
    expect(result.output).toContain('## Modified events');
    expect(result.output).toContain('`task_completed`');
  });

  it('apply pushes the diff; a re-run is in sync', async () => {
    const applied = await runSync(cfg({ mode: 'apply' }));
    expect(applied.code).toBe(0);
    expect(applied.output).toContain('added: 1');
    expect(applied.output).toContain('modified: 1');

    const rerun = await runSync(cfg({ mode: 'diff' }));
    expect(rerun.code).toBe(0);
    expect(rerun.output).toContain('in sync');
  });

  it('treats a backend-active event missing locally as a removal', async () => {
    const file = JSON.parse(await readFile(join(dir, 'registry.json'), 'utf8'));
    const withoutFeedback = file.filter((e: { event: string }) => e.event !== 'feedback_given');
    await writeRegistryFile(withoutFeedback);

    const result = await runSync(cfg({ mode: 'diff' }));
    expect(result.code).toBe(2);
    expect(result.output).toContain('## Removed events');
    expect(result.output).toContain('`feedback_given`');

    const applied = await runSync(cfg({ mode: 'apply' }));
    expect(applied.code).toBe(0);
    expect(applied.output).toContain('removed: 1');
  });
});

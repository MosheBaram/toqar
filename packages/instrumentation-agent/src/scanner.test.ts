import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { seamMapSchema, type Seam } from '@toqar/registry';
import { describe, expect, it } from 'vitest';
import { scanRepo } from './scanner.js';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/agentic-app-demo');
const OPTS = { repo: 'fixtures/agentic-app-demo', agentVersion: 'instrumentation-agent@0.1.0', now: () => '2026-07-09T12:00:00.000Z' };

function locations(seams: Seam[], kind: Seam['kind']): string[] {
  return seams.filter((s) => s.kind === kind).map((s) => s.location);
}

describe('scanRepo on the fixture app', () => {
  it('produces a valid seam map with the known seams', async () => {
    const result = await scanRepo(FIXTURE, OPTS);
    if (!result.supported) throw new Error(`unexpectedly unsupported: ${result.reason}`);
    const map = result.seamMap;

    expect(seamMapSchema.safeParse(map).success).toBe(true);
    expect(map.frameworks).toContain('anthropic-sdk');

    expect(locations(map.seams, 'task_start')).toContain('src/agent.ts:12');
    expect(locations(map.seams, 'llm_call')).toContain('src/agent.ts:17');
    expect(locations(map.seams, 'tool_call')).toEqual(
      expect.arrayContaining(['src/agent.ts:15', 'src/agent.ts:35']),
    );
    expect(locations(map.seams, 'handoff')).toContain('src/agent.ts:32');
    expect(locations(map.seams, 'outcome').length).toBeGreaterThanOrEqual(3);

    expect(map.task_taxonomy).toEqual(['reply_to_lead']);
    expect(map.produced_at).toBe('2026-07-09T12:00:00.000Z');
  });
});

describe('scanRepo refusals', () => {
  it('refuses a repo without package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toqar-scan-'));
    await writeFile(join(dir, 'pyproject.toml'), '[project]\nname = "py-agent"\n');
    const result = await scanRepo(dir, OPTS);
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toContain('package.json');
  });

  it('refuses a Node repo with no recognized agent stack', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toqar-scan-'));
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { koa: '^2.0.0' } }));
    await writeFile(join(dir, 'src', 'index.ts'), 'export const x = 1;\n');
    const result = await scanRepo(dir, OPTS);
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toMatch(/unsupported|recognized/i);
  });
});

describe('scanRepo on an express repo', () => {
  it('detects express routes as task starts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toqar-scan-'));
    await mkdir(join(dir, 'src'));
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { express: '^4.19.0', '@anthropic-ai/sdk': '^0.27.0' } }),
    );
    await writeFile(
      join(dir, 'src', 'server.ts'),
      [
        "import express from 'express';",
        "import Anthropic from '@anthropic-ai/sdk';",
        'const app = express();',
        'const anthropic = new Anthropic();',
        "app.post('/leads', async (req, res) => {",
        '  const r = await anthropic.messages.create({ model: "m", max_tokens: 1, messages: [] });',
        '  res.send(r);',
        '});',
      ].join('\n'),
    );
    const result = await scanRepo(dir, OPTS);
    if (!result.supported) throw new Error(result.reason);
    expect(result.seamMap.frameworks).toEqual(expect.arrayContaining(['express', 'anthropic-sdk']));
    expect(locations(result.seamMap.seams, 'task_start')).toContain('src/server.ts:5');
    expect(locations(result.seamMap.seams, 'llm_call')).toContain('src/server.ts:6');
  });
});

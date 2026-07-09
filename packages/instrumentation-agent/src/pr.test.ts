import { execFile } from 'node:child_process';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assemblePrBranch, buildPrBody } from './pr.js';
import { buildInstrumentationPlan } from './plan-builder.js';
import { scanRepo } from './scanner.js';

const run = promisify(execFile);
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/agentic-app-demo');

describe('PR assembly', () => {
  it('creates the instrumentation branch with a commit and a truthful body', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toqar-pr-'));
    await cp(FIXTURE, dir, { recursive: true });
    await run('git', ['init', '-b', 'main'], { cwd: dir });
    await run('git', ['add', '-A'], { cwd: dir });
    await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'base'], { cwd: dir });

    const scan = await scanRepo(dir, {
      repo: 'acme/sdr-agent',
      agentVersion: 'instrumentation-agent@0.1.0',
      now: () => '2026-07-09T15:00:00.000Z',
    });
    if (!scan.supported) throw new Error(scan.reason);
    const plan = buildInstrumentationPlan({
      seamMap: scan.seamMap,
      registry: [
        { event: 'task_started', description: 'x', journey: 'toqar_core', owner_metric: 'task_success_rate', status: 'active', since_version: '0.1.0' },
        { event: 'step_executed', description: 'x', journey: 'toqar_core', owner_metric: 'cost_per_completed_task', status: 'active', since_version: '0.1.0' },
      ],
      generatedAt: '2026-07-09T15:00:00.000Z',
    });

    // simulate the implement phase having written a file
    await writeFile(join(dir, 'src/analytics.ts'), '// generated wrapper\n');

    const result = await assemblePrBranch({
      repoPath: dir,
      plan,
      verificationCommands: ['node -e "process.exit(0)"'],
    });

    expect(result.branch).toBe('analytics/toqar-instrumentation');
    const { stdout: branch } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
    expect(branch.trim()).toBe('analytics/toqar-instrumentation');
    const { stdout: show } = await run('git', ['show', '--stat', 'HEAD'], { cwd: dir });
    expect(show).toContain('src/analytics.ts');

    expect(result.body).toContain('TOQAR analytics instrumentation');
    expect(result.body).toContain('2 events');
    expect(result.body).toContain('node -e "process.exit(0)"');
    expect(result.body).toContain('Rollback');
  });

  it('buildPrBody counts core vs product events honestly', () => {
    const body = buildPrBody({
      plan: {
        repo: 'a/b',
        generated_at: '2026-07-09T15:00:00.000Z',
        summary: 's',
        added: [
          { event: 'meeting_booked', description: 'd', journey: 'j', owner_metric: 'm', status: 'proposed', since_version: '0.1.0', code_locations: ['x:1'], implementation_notes: 'n' },
        ],
        modified: [
          { event: 'task_started', description: 'd', journey: 'toqar_core', owner_metric: 'm', status: 'active', since_version: '0.1.0', code_locations: ['x:1'], implementation_notes: 'n' },
        ],
        removed: [],
      },
      verificationCommands: ['pnpm test'],
    });
    expect(body).toContain('2 events: 1 TOQAR core + 1 product-specific');
  });
});

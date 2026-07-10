import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDocs } from './check.js';

const CONTENT = resolve(import.meta.dirname, '../content');

describe('checkDocs — docs cannot drift from code', () => {
  it('the shipped docs pass: every claimed event/metric exists', async () => {
    const result = await checkDocs(CONTENT);
    expect(result.violations, JSON.stringify(result.violations)).toEqual([]);
    expect(result.checked).toBeGreaterThan(0);
  });

  it('fails on an aspirational event claim', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toqar-docs-'));
    await writeFile(
      join(dir, 'bad.md'),
      '<!-- claims: events=task_completed,teleport_lead -->\n# Bad doc\n',
    );
    const result = await checkDocs(dir);
    expect(result.violations.some((v) => v.includes('teleport_lead'))).toBe(true);
  });

  it('fails on an aspirational metric claim', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toqar-docs-'));
    await writeFile(
      join(dir, 'bad.md'),
      '<!-- claims: metrics=task_success_rate,vibes_per_hour -->\n# Bad doc\n',
    );
    const result = await checkDocs(dir);
    expect(result.violations.some((v) => v.includes('vibes_per_hour'))).toBe(true);
  });

  it('passes a doc that claims nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'toqar-docs-'));
    await writeFile(join(dir, 'plain.md'), '# Just prose, no claims.\n');
    const result = await checkDocs(dir);
    expect(result.violations).toEqual([]);
  });
});

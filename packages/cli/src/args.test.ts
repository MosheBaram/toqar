import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

const argv = (...rest: string[]) => ['node', 'toqar', ...rest];

describe('parseArgs', () => {
  it('defaults to diff mode and the conventional file path', () => {
    expect(parseArgs(argv('sync'))).toEqual({
      mode: 'diff',
      filePath: 'analytics/registry.json',
    });
  });

  it('parses --apply, --pull, and --file', () => {
    expect(parseArgs(argv('sync', '--apply'))).toEqual({
      mode: 'apply',
      filePath: 'analytics/registry.json',
    });
    expect(parseArgs(argv('sync', '--pull', '--file', 'x/reg.json'))).toEqual({
      mode: 'pull',
      filePath: 'x/reg.json',
    });
  });

  it('rejects --apply together with --pull', () => {
    expect(parseArgs(argv('sync', '--apply', '--pull'))).toBe(
      '--apply and --pull are mutually exclusive',
    );
  });

  it('returns usage for an unknown command', () => {
    expect(parseArgs(argv('nope'))).toContain('usage:');
  });
});

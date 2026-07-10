import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

const argv = (...rest: string[]) => ['node', 'toqar', ...rest];

describe('parseArgs — sync', () => {
  it('defaults to diff mode and the conventional file path', () => {
    expect(parseArgs(argv('sync'))).toEqual({
      cmd: 'sync',
      mode: 'diff',
      filePath: 'analytics/registry.json',
    });
  });

  it('parses --apply, --pull, and --file', () => {
    expect(parseArgs(argv('sync', '--apply'))).toEqual({
      cmd: 'sync',
      mode: 'apply',
      filePath: 'analytics/registry.json',
    });
    expect(parseArgs(argv('sync', '--pull', '--file', 'x/reg.json'))).toEqual({
      cmd: 'sync',
      mode: 'pull',
      filePath: 'x/reg.json',
    });
  });

  it('rejects --apply together with --pull', () => {
    expect(parseArgs(argv('sync', '--apply', '--pull'))).toBe(
      '--apply and --pull are mutually exclusive',
    );
  });
});

describe('parseArgs — instrument', () => {
  it('parses path and approve flag', () => {
    expect(parseArgs(argv('instrument', '../their-repo'))).toEqual({
      cmd: 'instrument',
      path: '../their-repo',
      approve: false,
    });
    expect(parseArgs(argv('instrument', '.', '--approve'))).toEqual({
      cmd: 'instrument',
      path: '.',
      approve: true,
    });
  });

  it('requires a path', () => {
    expect(parseArgs(argv('instrument'))).toContain('usage: toqar instrument');
    expect(parseArgs(argv('instrument', '--approve'))).toContain('usage: toqar instrument');
  });
});

describe('parseArgs — onboard', () => {
  it('parses the repo path', () => {
    expect(parseArgs(argv('onboard', '../their-repo'))).toEqual({
      cmd: 'onboard',
      path: '../their-repo',
    });
  });

  it('requires a path', () => {
    expect(parseArgs(argv('onboard'))).toContain('usage: toqar onboard');
  });
});

describe('parseArgs — unknown', () => {
  it('returns usage for an unknown command', () => {
    expect(parseArgs(argv('nope'))).toContain('usage:');
  });
});

import type { SyncConfig } from './sync.js';

export type ParsedArgs =
  | { cmd: 'sync'; mode: SyncConfig['mode']; filePath: string }
  | { cmd: 'instrument'; path: string; approve: boolean };

const USAGE =
  'usage: toqar sync [--apply | --pull] [--file <path>] | toqar instrument <path> [--approve]';

/** Parses toqar argv; returns a usage/error string on bad input. */
export function parseArgs(argv: string[]): ParsedArgs | string {
  const args = argv.slice(2);

  if (args[0] === 'sync') {
    const apply = args.includes('--apply');
    const pull = args.includes('--pull');
    if (apply && pull) return '--apply and --pull are mutually exclusive';
    const fileIdx = args.indexOf('--file');
    const filePath =
      fileIdx !== -1 && args[fileIdx + 1] ? args[fileIdx + 1]! : 'analytics/registry.json';
    return { cmd: 'sync', mode: apply ? 'apply' : pull ? 'pull' : 'diff', filePath };
  }

  if (args[0] === 'instrument') {
    const path = args[1];
    if (!path || path.startsWith('--')) return 'usage: toqar instrument <path> [--approve]';
    return { cmd: 'instrument', path, approve: args.includes('--approve') };
  }

  return USAGE;
}

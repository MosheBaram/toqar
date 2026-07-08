import type { SyncConfig } from './sync.js';

/** Parses `toqar sync` argv; returns a usage/error string on bad input. */
export function parseArgs(
  argv: string[],
): { mode: SyncConfig['mode']; filePath: string } | string {
  const args = argv.slice(2);
  if (args[0] !== 'sync') {
    return 'usage: toqar sync [--apply | --pull] [--file <path>]';
  }
  const apply = args.includes('--apply');
  const pull = args.includes('--pull');
  if (apply && pull) return '--apply and --pull are mutually exclusive';
  const fileIdx = args.indexOf('--file');
  const filePath =
    fileIdx !== -1 && args[fileIdx + 1] ? args[fileIdx + 1]! : 'analytics/registry.json';
  return { mode: apply ? 'apply' : pull ? 'pull' : 'diff', filePath };
}

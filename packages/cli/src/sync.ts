import { basename } from 'node:path';
import { renderTrackingPlan } from '@toqar/registry';
import { ApiError, createRegistryApi } from './api.js';
import { computeDiff, isEmptyDiff } from './diff.js';
import { loadRegistryFile, RegistryFileError, writeRegistryFile } from './file.js';

export interface SyncConfig {
  /** Backend base URL (env: TOQAR_API_URL). */
  apiUrl?: string | undefined;
  /** Tenant token (env: TOQAR_TOKEN). Never printed. */
  token?: string | undefined;
  /** Registry-as-code file, e.g. analytics/registry.json. */
  filePath: string;
  mode: 'diff' | 'apply' | 'pull';
  /** Repo label for the rendered plan; defaults to the file's directory name. */
  repo?: string;
  /** Injectable clock for deterministic output. */
  now?: () => string;
}

export interface SyncResult {
  /** 0 in sync / applied / pulled · 2 diff present · 1 error. */
  code: number;
  output: string;
}

export const EXIT_IN_SYNC = 0;
export const EXIT_ERROR = 1;
export const EXIT_DIFF = 2;

/** The whole sync workflow as a pure-ish function so tests and bin share it. */
export async function runSync(cfg: SyncConfig): Promise<SyncResult> {
  const lines: string[] = [];

  if (!cfg.apiUrl) {
    return { code: EXIT_ERROR, output: 'TOQAR_API_URL is not set — export it to point at the registry backend' };
  }
  if (!cfg.token) {
    return { code: EXIT_ERROR, output: 'TOQAR_TOKEN is not set — export your tenant token (never commit it)' };
  }

  const api = createRegistryApi(cfg.apiUrl, cfg.token);

  try {
    if (cfg.mode === 'pull') {
      const { entries } = await api.fetchRegistry();
      await writeRegistryFile(cfg.filePath, entries);
      lines.push(`pulled ${entries.length} entries into ${cfg.filePath}`);
      return { code: EXIT_IN_SYNC, output: lines.join('\n') };
    }

    const local = await loadRegistryFile(cfg.filePath);
    const { fingerprint, entries: remote } = await api.fetchRegistry();
    const plan = computeDiff({
      local,
      remote,
      repo: cfg.repo ?? basename(process.cwd()),
      filePath: cfg.filePath,
      generatedAt: cfg.now ? cfg.now() : new Date().toISOString(),
    });

    if (isEmptyDiff(plan)) {
      return { code: EXIT_IN_SYNC, output: 'registry is in sync — no drift' };
    }

    if (cfg.mode === 'diff') {
      lines.push(renderTrackingPlan(plan));
      lines.push('run with --apply to push this diff');
      return { code: EXIT_DIFF, output: lines.join('\n') };
    }

    const result = await api.applyPlan(plan, fingerprint);
    lines.push(
      `applied — added: ${result.added}, modified: ${result.modified}, removed: ${result.removed}`,
    );
    return { code: EXIT_IN_SYNC, output: lines.join('\n') };
  } catch (err) {
    if (err instanceof RegistryFileError) {
      return { code: EXIT_ERROR, output: `registry file invalid:\n${err.problems.join('\n')}` };
    }
    if (err instanceof ApiError) {
      const hint =
        err.status === 409 ? ' — backend changed since the diff; re-run toqar sync' : '';
      return { code: EXIT_ERROR, output: `api error (${err.status}): ${err.message}${hint}` };
    }
    return { code: EXIT_ERROR, output: `error: ${(err as Error).message}` };
  }
}

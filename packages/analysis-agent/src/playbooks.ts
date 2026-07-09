import {
  compileMetric,
  type MetricArgs,
  type MetricQuery,
  type QueryExecutor,
} from '@toqar/analysis';

/**
 * Playbooks are versioned, deterministic step lists (spec:
 * analysis-agent): the agent picks and orders steps; the semantic layer
 * computes every number. Narration templates interpolate only registered
 * metric value strings, so the citation validator holds by construction.
 */
export const PLAYBOOK_VERSION = 'playbooks@0.1.0';

export type Window = MetricArgs & { pivot: string };

export interface StepResult {
  query: MetricQuery;
  rows: Record<string, unknown>[];
}

export async function runMetric(
  executor: QueryExecutor,
  metric: string,
  window: Window,
  overrides: Partial<MetricArgs> = {},
): Promise<StepResult> {
  const query = compileMetric(metric, { ...window, ...overrides });
  const rows = await executor.execute(query);
  return { query, rows };
}

/* Formatting helpers — the registered strings prose is allowed to use. */
export const fmt = {
  pct(value: unknown): string {
    return `${(Number(value) * 100).toFixed(1)}%`;
  },
  pts(value: unknown): string {
    const pts = Number(value) * 100;
    return `${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts`;
  },
  usd(value: unknown): string {
    return `$${Number(value).toFixed(2)}`;
  },
  count(value: unknown): string {
    return String(Math.round(Number(value)));
  },
};

import type { BenchmarkResult } from '@toqar/analysis';

/**
 * Benchmark view state (spec: benchmarking-optin). The UI shows the cohort
 * distribution and the tenant's own position — never another tenant's
 * identity or raw value. A below-k cohort is shown as "not enough", not a
 * number.
 */

export async function fetchOptin(base: string, token: string): Promise<{ opted_in: boolean }> {
  const res = await fetch(`${base}/v1/benchmark/optin`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`benchmark optin ${res.status}`);
  return (await res.json()) as { opted_in: boolean };
}

export async function setOptin(base: string, token: string, optedIn: boolean): Promise<void> {
  const res = await fetch(`${base}/v1/benchmark/optin`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ opted_in: optedIn }),
  });
  if (!res.ok) throw new Error(`benchmark optin ${res.status}`);
}

export type BenchmarkView =
  | { kind: 'result'; result: BenchmarkResult }
  | { kind: 'requires_growth' }
  | { kind: 'requires_optin' }
  | { kind: 'unavailable' };

/** The gate answers by name (go-to-market §8.2): the UI shows which gate, never a blank error. */
export async function fetchBenchmark(base: string, token: string, metric: string): Promise<BenchmarkView> {
  const res = await fetch(`${base}/v1/benchmark/result?metric=${encodeURIComponent(metric)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 403) {
    const body = (await res.json()) as { error: string };
    return body.error === 'benchmark_requires_growth' ? { kind: 'requires_growth' } : { kind: 'requires_optin' };
  }
  if (res.status === 503) return { kind: 'unavailable' };
  if (!res.ok) throw new Error(`benchmark result ${res.status}`);
  const body = (await res.json()) as { result: BenchmarkResult };
  return { kind: 'result', result: body.result };
}

export function describeBenchmarkView(view: BenchmarkView): string {
  if (view.kind === 'requires_growth') {
    return 'Benchmark comparisons are a Growth feature. Your data can contribute on any tier; upgrading unlocks the cohort view.';
  }
  if (view.kind === 'requires_optin') {
    return 'See the cohort by contributing to it: enable benchmarking to compare against accounts like yours.';
  }
  if (view.kind === 'unavailable') {
    return 'The benchmark service is not available in this deployment.';
  }
  return describeBenchmark(view.result);
}

export function describeBenchmark(result: BenchmarkResult): string {
  if (result.suppressed) {
    return 'Not enough opted-in accounts to show a benchmark yet — the cohort is too small to compare against without revealing an individual account.';
  }
  const { mean, stddev, count } = result.distribution;
  const own =
    result.own_percentile !== undefined
      ? ` You sit at the ${result.own_percentile}th percentile of the cohort.`
      : '';
  return `Across a cohort of ${count} opted-in accounts, the mean is ${mean} (±${stddev}).${own}`;
}

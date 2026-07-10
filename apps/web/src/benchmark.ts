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

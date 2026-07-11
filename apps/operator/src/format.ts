/** Display helpers. Formatting only — never fabricates a value. */

export function mergeRatePct(merged: number, delivered: number): string {
  if (delivered === 0) return '—';
  return `${((merged / delivered) * 100).toFixed(1)}%`;
}

export function usd(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

export function durationFromMs(ms: number | null): string {
  if (ms === null) return '—';
  const h = ms / 3_600_000;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

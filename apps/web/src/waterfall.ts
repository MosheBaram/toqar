/**
 * Display rows for the run drill-down (spec: trace-explorer). Pure
 * formatting over a reconstructed run — every value shown comes from the
 * recorded fields; nothing is fabricated for layout.
 */

export interface RunLike {
  outcome: string;
  steps: {
    tool_name: string;
    model: string;
    status: string;
    latency_ms: number;
    tokens_in: number;
    tokens_out: number;
    retry_of_step_id: string;
    timestamp: string;
  }[];
  human_events: { event: string; timestamp: string }[];
  totals: { steps: number; errors: number; retries: number; tokens: number; cost_usd: number };
}

export interface WaterfallRow {
  kind: 'step' | 'human';
  label: string;
  detail: string;
  timestamp: string;
  /** Bar width share of the run's slowest step (0..1); 0 for human events. */
  share: number;
  highlight: 'error' | 'retry' | 'human' | 'none';
}

export function waterfallRows(run: RunLike): WaterfallRow[] {
  const slowest = Math.max(1, ...run.steps.map((s) => s.latency_ms));
  const stepRows: WaterfallRow[] = run.steps.map((s) => ({
    kind: 'step',
    label: s.tool_name || s.model || 'step',
    detail: [
      s.model && s.tool_name ? s.model : '',
      s.latency_ms ? `${s.latency_ms}ms` : '',
      s.tokens_in + s.tokens_out > 0 ? `${s.tokens_in + s.tokens_out} tok` : '',
      s.status && s.status !== 'ok' ? s.status : '',
    ]
      .filter(Boolean)
      .join(' · '),
    timestamp: s.timestamp,
    share: s.latency_ms / slowest,
    highlight: s.status && s.status !== 'ok' ? 'error' : s.retry_of_step_id ? 'retry' : 'none',
  }));
  const humanRows: WaterfallRow[] = run.human_events.map((h) => ({
    kind: 'human',
    label: h.event,
    detail: '',
    timestamp: h.timestamp,
    share: 0,
    highlight: 'human',
  }));
  return [...stepRows, ...humanRows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

import type { RunLike } from '../waterfall.js';
import { waterfallRows } from '../waterfall.js';
import { Card } from './primitives.tsx';

/**
 * The run drill-down (spec: trace-explorer): "why did this run fail?" as a
 * time-ordered waterfall. Data arrives from the agent-native query surface
 * (MCP get_run / compileRunQuery) — every number shown is a recorded field.
 */
const HIGHLIGHT: Record<string, string> = {
  error: 'var(--failed)',
  retry: 'var(--abandoned)',
  human: 'var(--primary)',
  none: 'var(--border)',
};

export function RunWaterfall({ run, taskId }: { run: RunLike; taskId: string }) {
  const rows = waterfallRows(run);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <strong style={{ fontFamily: 'var(--font-mono)' }}>{taskId}</strong>
        <span style={{ fontSize: 'var(--fs-caption)', color: run.outcome === 'completed' ? 'var(--success)' : 'var(--failed)' }}>
          {run.outcome}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
          {run.totals.steps} steps · {run.totals.errors} errors · {run.totals.retries} retries · {run.totals.tokens} tok
        </span>
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                height: '10px',
                width: `${Math.max(2, row.share * 100)}%`,
                background: HIGHLIGHT[row.highlight],
                borderRadius: 'var(--radius-xs)',
              }}
            />
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{row.detail}</span>
          </div>
        </div>
      ))}
    </Card>
  );
}

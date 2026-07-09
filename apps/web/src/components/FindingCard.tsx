import { useState } from 'react';
import type { FeedFinding } from '../api.js';
import { Card, LayerKey, QueryChip, SeverityChip } from './primitives.tsx';

/** The feed unit + inline evidence drill-down (D2 FindingCard/EvidenceDrilldown). */
export function FindingCard({ finding }: { finding: FeedFinding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <LayerKey layer={finding.layer} />
        <SeverityChip severity={finding.severity} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
          {finding.variant}
        </span>
        <span style={{ flex: 1 }} />
        <time style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
          {new Date(finding.published_at).toLocaleString()}
        </time>
      </div>

      <h3 style={{ margin: 0, fontSize: 'var(--fs-lead)', lineHeight: 1.35, fontWeight: 600 }}>
        {finding.headline}
      </h3>

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        {finding.metrics.map((m) => (
          <span key={m.label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
              {m.label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-base)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {m.value}
            </span>
            <QueryChip id={m.query_id} />
          </span>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 'var(--fs-body)', lineHeight: 1.55, color: 'var(--text-muted)' }}>
        {finding.summary}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', fontWeight: 600,
            color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
          }}
        >
          {expanded ? 'collapse ↑' : `↳ show the work · ${finding.evidence.length} steps`}
        </button>
      </div>

      {expanded ? (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {finding.evidence.map((step, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: '0 10px' }}>
              <span
                style={{
                  width: '22px', height: '22px', borderRadius: 'var(--radius-sm)',
                  border: '1.5px solid var(--border-strong)', fontFamily: 'var(--font-mono)',
                  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: 'var(--fs-body)', fontWeight: 500 }}>{step.title}</span>
                {step.note ? (
                  <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>{step.note}</span>
                ) : null}
                <QueryChip id={step.query_id} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}

    </Card>
  );
}

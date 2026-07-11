import type { CSSProperties, ReactNode } from 'react';

/**
 * Operator console primitives on the Toqar design tokens
 * (skills/toqar-design). This is the internal grid-of-rollups console —
 * the "not a dashboard grid" rule governs the customer feed, not here.
 */

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        boxShadow: 'var(--shadow-sm)', ...style,
      }}
    >
      {children}
    </div>
  );
}

const STATUS: Record<string, { fg: string; bg: string }> = {
  ok: { fg: 'var(--success)', bg: 'var(--success-soft)' },
  degraded: { fg: 'var(--failed)', bg: 'var(--failed-soft)' },
  down: { fg: 'var(--failed)', bg: 'var(--failed-soft)' },
  up: { fg: 'var(--success)', bg: 'var(--success-soft)' },
};

export function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { fg: 'var(--text-muted)', bg: 'var(--surface-2)' };
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', fontWeight: 600,
        padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: s.bg, color: s.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ gap: '4px' }}>
      <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--fs-h2)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{value}</span>
      {sub ? <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{sub}</span> : null}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: 'var(--fs-small)' }}>
      {children}
    </div>
  );
}

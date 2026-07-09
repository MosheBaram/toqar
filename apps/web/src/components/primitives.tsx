import type { CSSProperties, ReactNode } from 'react';
import { formatEventName } from '../format.js';

/**
 * Productized from the D2 reference components in skills/toqar-design —
 * typed props from the shipped .d.ts contracts, tokens consumed verbatim.
 */

export const LAYER_COLOR: Record<string, string> = {
  T: 'var(--toqar-t)', O: 'var(--toqar-o)', Q: 'var(--toqar-q)',
  A: 'var(--toqar-a)', R: 'var(--toqar-r)',
};

const SEVERITY: Record<string, { fg: string; bg: string }> = {
  critical: { fg: 'var(--failed)', bg: 'var(--failed-soft)' },
  warning: { fg: 'var(--abandoned)', bg: 'var(--abandoned-soft)' },
  info: { fg: 'var(--text-muted)', bg: 'var(--surface-2)' },
  positive: { fg: 'var(--success)', bg: 'var(--success-soft)' },
};

export function LayerKey({ layer, size = 18 }: { layer: string; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, flex: 'none', borderRadius: 'var(--radius-xs)',
        background: LAYER_COLOR[layer] ?? 'var(--text-subtle)', color: '#fff',
        fontFamily: 'var(--font-mono)', fontSize: size * 0.61, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {layer}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.info!;
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', fontWeight: 600,
        padding: '2px 7px', borderRadius: 'var(--radius-sm)', background: s.bg, color: s.fg,
        lineHeight: 1.4, whiteSpace: 'nowrap',
      }}
    >
      {severity}
    </span>
  );
}

export function EventChip({ name, tone = 'neutral' }: { name: string; tone?: 'neutral' | 'primary' | 'quiet' }) {
  const tones: Record<string, CSSProperties> = {
    neutral: { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
    primary: { background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid transparent' },
    quiet: { background: 'transparent', color: 'var(--text-subtle)', border: '1px solid var(--border-subtle)' },
  };
  return (
    <code
      style={{
        display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-micro)', fontWeight: 500, lineHeight: 1, padding: '3px 7px',
        borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', ...tones[tone],
      }}
    >
      {formatEventName(name)}
    </code>
  );
}

export function QueryChip({ id }: { id: string }) {
  return (
    <button
      onClick={() => void navigator.clipboard?.writeText(id)}
      title="Copy query id"
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', fontWeight: 600,
        color: 'var(--primary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      }}
    >
      ↳ {id}
    </button>
  );
}

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

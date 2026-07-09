import { useEffect, useMemo, useState } from 'react';
import type { RegistryEntry } from '@toqar/registry';
import { createTenantApi, type FeedFinding, type TenantApi } from './api.js';
import { FindingCard } from './components/FindingCard.tsx';
import { Card, EventChip, LayerKey } from './components/primitives.tsx';

const NAV = ['Feed', 'Registry', 'Settings'] as const;
type Tab = (typeof NAV)[number];
const LAYERS = ['T', 'O', 'Q', 'A', 'R'];
const SEVERITIES = ['critical', 'warning', 'positive', 'info'];

const AUTONOMY_LEVELS = [
  { id: 0, name: 'Read-only analysis', scope: 'analysis.read', description: 'The agent queries your event stream and posts findings. It cannot touch your repo.' },
  { id: 1, name: 'Instrumentation PRs', scope: 'repo.pr.instrumentation', description: 'The agent may open pull requests that add or fix tracking calls. You review and merge.' },
  { id: 2, name: 'Experiment PRs', scope: 'repo.pr.experiment', description: 'The agent may open pull requests that run guarded experiments. You review and merge.' },
];

function FilterChip({ active, onClick, layer, children }: { active: boolean; onClick: () => void; layer?: string; children: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        fontSize: 'var(--fs-micro)', fontWeight: 500, lineHeight: 1, padding: '5px 9px',
        borderRadius: 'var(--radius-pill)', cursor: 'pointer',
        background: active ? 'var(--primary-soft)' : 'var(--surface)',
        color: active ? 'var(--primary)' : 'var(--text-muted)',
        border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
      }}
    >
      {layer ? <LayerKey layer={layer} size={8} /> : null}
      {children}
    </button>
  );
}

function FeedPage({ api }: { api: TenantApi }) {
  const [findings, setFindings] = useState<FeedFinding[] | null>(null);
  const [layers, setLayers] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string | null>(null);
  const [registryCount, setRegistryCount] = useState<number | null>(null);

  useEffect(() => {
    void api.listFindings().then(setFindings);
    void api.getRegistry().then((entries) => setRegistryCount(entries.length));
  }, [api]);

  const shown = useMemo(
    () =>
      (findings ?? []).filter(
        (f) => (!layers.length || layers.includes(f.layer)) && (!severity || f.severity === severity),
      ),
    [findings, layers, severity],
  );

  if (findings === null) return <p style={{ color: 'var(--text-muted)' }}>loading…</p>;

  if (findings.length === 0) {
    return (
      <Card style={{ marginTop: '32px', padding: '28px' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-h3)', fontWeight: 600 }}>No findings yet.</h2>
        <p style={{ margin: 0, fontSize: 'var(--fs-body)', lineHeight: 1.55, color: 'var(--text-muted)' }}>
          That's expected. The analysis agent won't post a finding it can't trace to a query — and
          no sweep has completed for this tenant yet.
        </p>
        <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-small)', color: 'var(--text-subtle)' }}>
          registry synced · {registryCount ?? '…'} events active
        </p>
      </Card>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {LAYERS.map((l) => (
          <FilterChip key={l} layer={l} active={layers.includes(l)} onClick={() => setLayers(layers.includes(l) ? layers.filter((x) => x !== l) : [...layers, l])}>
            {l}
          </FilterChip>
        ))}
        <span style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 4px' }} />
        {SEVERITIES.map((s) => (
          <FilterChip key={s} active={severity === s} onClick={() => setSeverity(severity === s ? null : s)}>
            {s}
          </FilterChip>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
          {shown.length} findings
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {shown.map((f) => (
          <FindingCard key={f.finding_id} finding={f} />
        ))}
      </div>
    </>
  );
}

function RegistryPage({ api }: { api: TenantApi }) {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    void api.getRegistry().then(setEntries);
  }, [api]);
  const entry = entries[selected];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '14px', alignItems: 'start' }}>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        {entries.map((e, i) => (
          <button
            key={e.event}
            onClick={() => setSelected(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
              padding: '8px 12px', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid var(--border-subtle)',
              background: i === selected ? 'var(--primary-soft)' : 'var(--surface)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-micro)',
              color: e.status === 'deprecated' ? 'var(--text-subtle)' : i === selected ? 'var(--primary)' : 'var(--text)',
              textDecoration: e.status === 'deprecated' ? 'line-through' : 'none',
            }}
          >
            {e.event}
          </button>
        ))}
      </Card>
      {entry ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <EventChip name={entry.event} tone="primary" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
              {entry.status} · since {entry.since_version}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--fs-body)', color: 'var(--text)' }}>{entry.description}</p>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
            journey: {entry.journey} · owner metric: {entry.owner_metric}
          </p>
          {entry.hypothesis ? (
            <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>Hypothesis: {entry.hypothesis}</p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function SettingsPage({ api }: { api: TenantApi }) {
  const [state, setState] = useState<{ level: number; history: { level: number; granted_by: string; granted_at: string }[] } | null>(null);
  useEffect(() => {
    void api.getAutonomy().then(setState);
  }, [api]);
  if (!state) return <p style={{ color: 'var(--text-muted)' }}>loading…</p>;

  async function change(level: number) {
    if (level > state!.level) {
      const who = window.prompt(`Raising autonomy to level ${level} is an audited grant. Enter your name to confirm:`);
      if (!who) return;
      await api.grantAutonomy(level, who);
    } else if (level < state!.level) {
      const who = window.prompt(`Lowering autonomy to level ${level}. Enter your name:`);
      if (!who) return;
      await api.grantAutonomy(level, who);
    }
    setState(await api.getAutonomy());
  }

  return (
    <Card style={{ maxWidth: '560px', padding: 0, gap: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', gap: '8px' }}>
        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>
          Autonomy level
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' }}>
          level {state.level} of 2
        </span>
      </div>
      {AUTONOMY_LEVELS.map((l) => {
        const granted = l.id <= state.level;
        const auditLine = state.history.find((h) => h.level === l.id);
        return (
          <button
            key={l.id}
            onClick={() => void change(l.id)}
            style={{
              display: 'grid', gridTemplateColumns: '18px 1fr', gap: '2px 12px', width: '100%',
              textAlign: 'left', padding: '12px 14px', border: 'none',
              borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
              background: l.id === state.level ? 'var(--primary-soft)' : 'var(--surface)', color: 'var(--text)',
            }}
          >
            <span style={{ width: '14px', height: '14px', marginTop: '3px', borderRadius: 'var(--radius-xs)', gridRow: '1 / span 3', background: granted ? 'var(--primary)' : 'transparent', border: '1.5px solid ' + (granted ? 'var(--primary)' : 'var(--border-strong)') }} />
            <span style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--fs-body)', fontWeight: 600 }}>{l.id}. {l.name}</span>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: granted ? 'var(--primary)' : 'var(--text-subtle)' }}>{l.scope}</code>
            </span>
            <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{l.description}</span>
            {auditLine ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)', marginTop: '2px' }}>
                granted by {auditLine.granted_by} · {new Date(auditLine.granted_at).toLocaleDateString()}
              </span>
            ) : null}
          </button>
        );
      })}
      <div style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)', background: 'var(--surface-2)' }}>
        Each level includes the levels below it. All grants are logged.
      </div>
    </Card>
  );
}

export function App({ api, tenantLabel }: { api: TenantApi; tenantLabel: string }) {
  const [tab, setTab] = useState<Tab>('Feed');
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '0 24px', height: '52px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <span style={{ fontWeight: 600, fontSize: '17px', letterSpacing: '-0.015em' }}>toqar</span>
        <nav style={{ display: 'flex', gap: '4px', alignSelf: 'stretch' }}>
          {NAV.map((n) => (
            <button
              key={n}
              onClick={() => setTab(n)}
              style={{
                display: 'inline-flex', alignItems: 'center', padding: '0 10px', border: 'none',
                background: 'none', cursor: 'pointer', fontSize: 'var(--fs-small)',
                fontWeight: n === tab ? 600 : 400,
                color: n === tab ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: n === tab ? 'inset 0 -2px 0 var(--primary)' : 'none',
              }}
            >
              {n}
            </button>
          ))}
        </nav>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 8px' }}>
          {tenantLabel}
        </span>
      </header>
      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 24px 48px' }}>
        {tab === 'Feed' ? <FeedPage api={api} /> : tab === 'Registry' ? <RegistryPage api={api} /> : <SettingsPage api={api} />}
      </main>
    </div>
  );
}

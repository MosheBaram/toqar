import { useEffect, useState } from 'react';
import type { Health, OperatorApi, Rollups, TenantSnapshot, TenantSummary } from './api.js';
import { Card, Empty, Stat, StatusChip } from './components/primitives.tsx';
import { durationFromMs, mergeRatePct, usd } from './format.js';

const NAV = ['Tenants', 'Platform', 'Health'] as const;
type Tab = (typeof NAV)[number];

const cell: React.CSSProperties = {
  padding: '8px 12px', fontSize: 'var(--fs-small)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left',
};

export function App({ api, label }: { api: OperatorApi; label: string }) {
  const [tab, setTab] = useState<Tab>('Tenants');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
        <strong style={{ fontSize: 'var(--fs-h3)' }}>Toqar Operator</strong>
        <nav style={{ display: 'flex', gap: '4px' }}>
          {NAV.map((n) => (
            <button
              key={n}
              onClick={() => setTab(n)}
              style={{
                padding: '6px 12px', fontSize: 'var(--fs-small)', fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                background: tab === n ? 'var(--primary)' : 'var(--surface)',
                color: tab === n ? 'var(--primary-fg)' : 'var(--text-muted)',
              }}
            >
              {n}
            </button>
          ))}
        </nav>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      </header>
      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '24px' }}>
        {tab === 'Tenants' ? <Tenants api={api} /> : tab === 'Platform' ? <Platform api={api} /> : <HealthView api={api} />}
      </main>
    </div>
  );
}

function Tenants({ api }: { api: OperatorApi }) {
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [open, setOpen] = useState<TenantSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTenants().then(setTenants).catch((e) => setError(String(e)));
  }, [api]);

  if (error) return <Empty>Could not load tenants: {error}</Empty>;
  if (!tenants) return <Empty>Loading…</Empty>;
  if (tenants.length === 0) return <Empty>No tenants yet.</Empty>;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th style={cell}>Tenant</th><th style={cell}>Onboarding</th><th style={cell}>Autonomy</th><th style={cell}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.tenant_id} onClick={() => api.getTenant(t.tenant_id).then(setOpen)} style={{ cursor: 'pointer' }}>
                <td style={cell}>{t.name}</td>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{t.onboarding_step}</td>
                <td style={cell}>L{t.autonomy_level}</td>
                <td style={cell}>{t.billing_tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {open ? <Drilldown snap={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Drilldown({ snap, onClose }: { snap: TenantSnapshot; onClose: () => void }) {
  const mr = snap.instrument_runs.merge_rate;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--fs-h3)' }}>{snap.name}</strong>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        <Stat label="Registry" value={`${snap.registry.active}`} sub={`${snap.registry.deprecated} deprecated`} />
        <Stat label="Autonomy" value={`L${snap.autonomy.level}`} />
        <Stat label="Tier" value={String(snap.billing.tier ?? '—')} />
        <Stat label="Merge rate" value={mergeRatePct(mr.merged, mr.delivered)} sub={`${mr.merged}/${mr.delivered} runs`} />
        <Stat label="Experiments" value={`${snap.experiments.length}`} />
        <Stat label="Onboarding" value={String((snap.onboarding as { current_step?: string }).current_step ?? '—')} />
      </div>
    </Card>
  );
}

function Platform({ api }: { api: OperatorApi }) {
  const [r, setR] = useState<Rollups | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getRollups().then(setR).catch((e) => setError(String(e)));
  }, [api]);

  if (error) return <Empty>Could not load rollups: {error}</Empty>;
  if (!r) return <Empty>Loading…</Empty>;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        <Stat label="Tenants" value={`${r.tenants}`} />
        <Stat label="Merge rate" value={mergeRatePct(r.merge_rate.merged, r.merge_rate.delivered)} sub={`${r.merge_rate.merged}/${r.merge_rate.delivered} runs`} />
        <Stat label="Recurring / mo" value={usd(r.revenue.recurring_usd_month)} sub={`${usd(r.revenue.invoiced_usd_total)} invoiced`} />
        <Stat label="Median TTFF" value={durationFromMs(r.median_time_to_first_finding_ms)} />
      </div>
      <Card>
        <strong>Onboarding funnel</strong>
        {Object.keys(r.onboarding_funnel).length === 0 ? (
          <Empty>No tenants yet.</Empty>
        ) : (
          Object.entries(r.onboarding_funnel).map(([step, n]) => (
            <div key={step} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-small)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{step}</span>
              <span>{n}</span>
            </div>
          ))
        )}
      </Card>
      <Card>
        <strong>Finding rejections</strong>
        {r.finding_rejections.length === 0 ? (
          <Empty>No rejections recorded.</Empty>
        ) : (
          r.finding_rejections.map((row) => (
            <div key={row.reason} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-small)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{row.reason}</span>
              <span>{row.count}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function HealthView({ api }: { api: OperatorApi }) {
  const [h, setH] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getHealth().then(setH).catch((e) => setError(String(e)));
  }, [api]);

  if (error) return <Empty>Could not load health: {error}</Empty>;
  if (!h) return <Empty>Loading…</Empty>;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <strong style={{ fontSize: 'var(--fs-h3)' }}>Platform health</strong>
        <StatusChip status={h.status} />
      </div>
      {h.services.map((s) => (
        <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-small)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{s.name}</span>
          <StatusChip status={s.status} />
        </div>
      ))}
    </Card>
  );
}

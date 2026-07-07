import React from "react";
import { EventChip } from "../data/EventChip.jsx";
import { DeltaBadge } from "../data/DeltaBadge.jsx";
import { Sparkline } from "./Sparkline.jsx";

export const LAYER_COLOR = {
  T: "var(--toqar-t)", O: "var(--toqar-o)", Q: "var(--toqar-q)",
  A: "var(--toqar-a)", R: "var(--toqar-r)",
};
const LAYER_SOFT = {
  T: "var(--toqar-t-soft)", O: "var(--toqar-o-soft)", Q: "var(--toqar-q-soft)",
  A: "var(--toqar-a-soft)", R: "var(--toqar-r-soft)",
};
const SEVERITY = {
  critical: { fg: "var(--failed)", bg: "var(--failed-soft)" },
  warning:  { fg: "var(--abandoned)", bg: "var(--abandoned-soft)" },
  info:     { fg: "var(--text-muted)", bg: "var(--surface-2)" },
  positive: { fg: "var(--success)", bg: "var(--success-soft)" },
};
const VARIANT_LABEL = {
  anomaly: "anomaly", regression: "regression",
  experiment: "experiment verdict", digest: "weekly digest",
};

export function LayerKey({ layer, size = 18 }) {
  return (
    <span style={{
      width: size, height: size, flex: "none", borderRadius: "var(--radius-xs)",
      background: LAYER_COLOR[layer] || "var(--text-subtle)", color: "#fff",
      fontFamily: "var(--font-mono)", fontSize: size * 0.61, fontWeight: 600,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>{layer}</span>
  );
}

function SeverityChip({ severity }) {
  const s = SEVERITY[severity] || SEVERITY.info;
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", fontWeight: 600,
      padding: "2px 7px", borderRadius: "var(--radius-sm)", background: s.bg, color: s.fg,
      lineHeight: 1.4, whiteSpace: "nowrap",
    }}>{severity}</span>
  );
}

function VersionChip({ v }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", fontWeight: 500,
      padding: "1px 6px", borderRadius: "var(--radius-sm)",
      border: "1px solid var(--border)", color: "var(--text-muted)", whiteSpace: "nowrap",
    }}>{v}</span>
  );
}

const VERDICT = {
  ship:         { label: "ship", fg: "var(--success)", bg: "var(--success-soft)" },
  revert:       { label: "revert", fg: "var(--failed)", bg: "var(--failed-soft)" },
  inconclusive: { label: "inconclusive", fg: "var(--text-muted)", bg: "var(--surface-2)" },
};

/* -------- metric zones per variant -------- */
function MetricZone({ variant, metric }) {
  const mono = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
  const label = { fontSize: "var(--fs-caption)", fontWeight: 600, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--text-subtle)" };
  if (!metric) return null;

  if (variant === "anomaly") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div>
          <div style={label}>{metric.label}</div>
          <div style={{ ...mono, fontSize: "var(--fs-h2)", fontWeight: 600, lineHeight: 1.15 }}>{metric.value}</div>
        </div>
        {metric.spark ? <Sparkline data={metric.spark} color={metric.sparkColor || "var(--failed)"} width={110} height={30} /> : null}
        {metric.delta ? <DeltaBadge {...metric.delta} /> : null}
      </div>
    );
  }
  if (variant === "regression") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <VersionChip v={metric.fromVersion} />
          <span style={{ ...mono, fontSize: "var(--fs-h3)", fontWeight: 600 }}>{metric.before}</span>
        </div>
        <span style={{ color: "var(--text-subtle)" }}>→</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <VersionChip v={metric.toVersion} />
          <span style={{ ...mono, fontSize: "var(--fs-h3)", fontWeight: 600, color: "var(--failed)" }}>{metric.after}</span>
        </div>
        {metric.delta ? <DeltaBadge {...metric.delta} /> : null}
      </div>
    );
  }
  if (variant === "experiment") {
    const v = VERDICT[metric.verdict] || VERDICT.inconclusive;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-micro)", fontWeight: 600, padding: "3px 9px", borderRadius: "var(--radius-sm)", background: v.bg, color: v.fg }}>verdict: {v.label}</span>
        {(metric.arms || []).map((a, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: "6px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-subtle)" }}>{a.name}</span>
            <span style={{ ...mono, fontSize: "var(--fs-base)", fontWeight: 600 }}>{a.value}</span>
          </span>
        ))}
      </div>
    );
  }
  if (variant === "digest") {
    return (
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
        {(metric.layers || []).map((l, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <LayerKey layer={l.layer} size={15} />
            <span style={{ ...mono, fontSize: "var(--fs-small)", fontWeight: 600 }}>{l.value}</span>
            {l.delta ? <DeltaBadge {...l.delta} /> : null}
          </span>
        ))}
      </div>
    );
  }
  return null;
}

/**
 * FindingCard — the core unit of the Toqar feed. An analysis agent posts a
 * narrative finding; every number links to the query that produced it.
 */
export function FindingCard({
  variant = "anomaly",
  layer = "T",
  severity = "info",
  headline,
  summary,
  metric,
  chips = [],
  timestamp,
  workSteps,
  queryId,
  onShowWork,
  style,
  ...rest
}) {
  return (
    <article
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: "14px 16px",
        fontFamily: "var(--font-sans)", color: "var(--text)",
        display: "flex", flexDirection: "column", gap: "10px",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
      {...rest}
    >
      {/* header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <LayerKey layer={layer} />
        <SeverityChip severity={severity} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-subtle)" }}>{VARIANT_LABEL[variant]}</span>
        <span style={{ flex: 1 }} />
        <time style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-subtle)", whiteSpace: "nowrap" }}>{timestamp}</time>
      </div>

      {/* headline */}
      <h3 style={{ margin: 0, fontSize: "var(--fs-lead)", lineHeight: 1.35, fontWeight: 600, letterSpacing: "-0.01em", textWrap: "pretty" }}>{headline}</h3>

      <MetricZone variant={variant} metric={metric} />

      {summary ? (
        <p style={{ margin: 0, fontSize: "var(--fs-body)", lineHeight: 1.55, color: "var(--text-muted)", textWrap: "pretty" }}>{summary}</p>
      ) : null}

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", paddingTop: "4px", borderTop: "1px solid var(--border-subtle)" }}>
        {chips.map((c, i) => <EventChip key={i} name={c} tone="quiet" />)}
        <span style={{ flex: 1 }} />
        {workSteps ? (
          <button
            onClick={onShowWork}
            style={{
              fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", fontWeight: 600,
              color: "var(--primary)", background: "none", border: "none", padding: "2px 0",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >↳ show the work · {workSteps} steps{queryId ? ` · ${queryId}` : ""}</button>
        ) : null}
      </div>
    </article>
  );
}

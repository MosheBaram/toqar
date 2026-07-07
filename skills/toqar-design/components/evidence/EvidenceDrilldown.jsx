import React from "react";
import { DeltaBadge } from "../data/DeltaBadge.jsx";
import { Sparkline } from "../feed/Sparkline.jsx";
import { LayerKey } from "../feed/FindingCard.jsx";

function QueryBlock({ query, queryId }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(query); } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ position: "relative", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
      <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "var(--fs-micro)", lineHeight: 1.55, color: "var(--text-muted)", whiteSpace: "pre-wrap", paddingRight: "56px" }}>{query}</pre>
      <div style={{ position: "absolute", top: "6px", right: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
        {queryId ? <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-subtle)" }}>{queryId}</span> : null}
        <button onClick={copy} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, color: copied ? "var(--success)" : "var(--primary)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </div>
  );
}

function ResultView({ result }) {
  if (!result) return null;
  const mono = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
  if (result.type === "table") {
    const cell = { padding: "4px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", fontSize: "var(--fs-micro)" };
    return (
      <table style={{ borderCollapse: "collapse", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", marginTop: "6px", minWidth: "60%" }}>
        <thead>
          <tr>{result.columns.map((c, i) => <th key={i} style={{ ...cell, ...mono, color: "var(--text-subtle)", fontWeight: 500 }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} style={{ ...cell, ...mono, color: "var(--text)" }}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (result.type === "stat") {
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "6px" }}>
        <span style={{ ...mono, fontSize: "var(--fs-h3)", fontWeight: 600, color: "var(--text)" }}>{result.value}</span>
        <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-subtle)" }}>{result.label}</span>
        {result.delta ? <DeltaBadge {...result.delta} /> : null}
      </div>
    );
  }
  if (result.type === "spark") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
        <Sparkline data={result.data} color={result.color || "var(--primary)"} width={140} height={30} />
        {result.label ? <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-subtle)" }}>{result.label}</span> : null}
      </div>
    );
  }
  return null;
}

/**
 * EvidenceDrilldown — the expanded finding: the agent's investigation chain,
 * step by step, each with its copyable query and result. Trust by showing work.
 */
export function EvidenceDrilldown({ layer, title, steps = [], conclusion, onCollapse, style, ...rest }) {
  return (
    <section
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: "14px 16px",
        fontFamily: "var(--font-sans)", color: "var(--text)",
        display: "flex", flexDirection: "column", gap: "12px",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {layer ? <LayerKey layer={layer} /> : null}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", fontWeight: 600, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--text-subtle)", whiteSpace: "nowrap" }}>Investigation · {steps.length} steps</span>
        <span style={{ flex: 1 }} />
        {onCollapse ? (
          <button onClick={onCollapse} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", fontWeight: 600, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>collapse ↑</button>
        ) : null}
      </div>

      {title ? <h3 style={{ margin: 0, fontSize: "var(--fs-lead)", fontWeight: 600, lineHeight: 1.35 }}>{title}</h3> : null}

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: "0 10px", position: "relative", paddingBottom: i === steps.length - 1 ? 0 : "14px" }}>
            {/* rail */}
            {i !== steps.length - 1 ? (
              <span style={{ position: "absolute", left: "10.25px", top: "22px", bottom: 0, width: "1.5px", background: "var(--border)" }} />
            ) : null}
            <span style={{
              width: "22px", height: "22px", borderRadius: "var(--radius-sm)",
              border: "1.5px solid var(--border-strong)", background: "var(--surface)",
              fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
            }}>{i + 1}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
              <div style={{ fontSize: "var(--fs-body)", fontWeight: 500, lineHeight: 1.4, paddingTop: "2px" }}>{s.title}</div>
              {s.note ? <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.5 }}>{s.note}</div> : null}
              {s.query ? <QueryBlock query={s.query} queryId={s.queryId} /> : null}
              <ResultView result={s.result} />
            </div>
          </li>
        ))}
      </ol>

      {conclusion ? (
        <div style={{ padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--primary-soft)", fontSize: "var(--fs-body)", lineHeight: 1.5, fontWeight: 500 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", fontWeight: 600, color: "var(--primary)" }}>conclusion ▸ </span>
          {conclusion}
        </div>
      ) : null}
    </section>
  );
}

import React from "react";
import { DeltaBadge } from "./DeltaBadge.jsx";

const LAYER_COLOR = {
  T: "var(--toqar-t)",
  O: "var(--toqar-o)",
  Q: "var(--toqar-q)",
  A: "var(--toqar-a)",
  R: "var(--toqar-r)",
};

/**
 * MetricsTable — Toqar's canonical data table. Mono values, tabular figures,
 * optional TOQAR layer accent stripe per row, and direction-aware deltas.
 *
 * row shape:
 *   { layer?: "T"|"O"|"Q"|"A"|"R", metric, sub?, value, prev, delta?: {value, goodWhen, unit, format} }
 */
export function MetricsTable({
  rows = [],
  showLayer = true,
  showPrev = true,
  columns = { value: "This week", prev: "Last week", delta: "Δ" },
  style,
  ...rest
}) {
  const cell = {
    padding: "9px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    textAlign: "left",
    verticalAlign: "middle",
  };
  const th = {
    ...cell,
    fontFamily: "var(--font-sans)",
    fontSize: "var(--fs-caption)",
    fontWeight: 600,
    letterSpacing: "var(--tracking-label)",
    textTransform: "uppercase",
    color: "var(--text-subtle)",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface-2)",
  };
  const num = {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--fs-body)",
    fontVariantNumeric: "tabular-nums",
    color: "var(--text)",
  };

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      <thead>
        <tr>
          <th style={{ ...th, width: showLayer ? "44%" : "50%" }}>Metric</th>
          <th style={{ ...th, textAlign: "right" }}>{columns.value}</th>
          {showPrev ? <th style={{ ...th, textAlign: "right", color: "var(--text-subtle)" }}>{columns.prev}</th> : null}
          <th style={{ ...th, textAlign: "right" }}>{columns.delta}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...cell }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>
                {showLayer && r.layer ? (
                  <span
                    style={{
                      width: "18px", height: "18px", flex: "none",
                      borderRadius: "var(--radius-xs)",
                      background: LAYER_COLOR[r.layer],
                      color: "#fff",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px", fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {r.layer}
                  </span>
                ) : null}
                <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-body)", fontWeight: 500, color: "var(--text)" }}>{r.metric}</span>
                  {r.sub ? <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-subtle)" }}>{r.sub}</span> : null}
                </span>
              </span>
            </td>
            <td style={{ ...cell, ...num, textAlign: "right", fontWeight: 600 }}>{r.value}</td>
            {showPrev ? <td style={{ ...cell, ...num, textAlign: "right", color: "var(--text-subtle)" }}>{r.prev}</td> : null}
            <td style={{ ...cell, textAlign: "right" }}>
              {r.delta ? (
                <DeltaBadge
                  value={r.delta.value}
                  goodWhen={r.delta.goodWhen}
                  unit={r.delta.unit}
                  format={r.delta.format}
                />
              ) : (
                <span style={{ color: "var(--text-subtle)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)" }}>—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

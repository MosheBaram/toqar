import React from "react";
import { MetricsTable } from "../components/data/MetricsTable.jsx";
import { DeltaBadge } from "../components/data/DeltaBadge.jsx";
import { StatusBadge } from "../components/data/StatusBadge.jsx";
import { EventChip } from "../components/data/EventChip.jsx";

/** Real AI-SDR example data — no lorem ipsum. */
export const SAMPLE_REPORT = {
  partner: "Northbeam AI",
  agent: "reply_to_lead",
  week: "Week of Jun 30 – Jul 6, 2026",
  headline: "reply_to_lead cleared 62% task success — but a third of wins were self-reported, not verified.",
  rows: [
    { layer: "T", metric: "Task success rate", sub: "task_completed / runs", value: "62.0%", prev: "57.9%", delta: { value: 4.1, unit: " pts" } },
    { layer: "O", metric: "Cost / completed task", sub: "usd", value: "$0.42", prev: "$0.48", delta: { value: -0.06, goodWhen: "down", format: (v) => `$${Math.abs(v).toFixed(2)}` } },
    { layer: "Q", metric: "Reply quality drift", sub: "vs. gold set", value: "3.7%", prev: "2.1%", delta: { value: 1.6, goodWhen: "down", unit: " pts" } },
    { layer: "A", metric: "Human takeovers", sub: "human_takeover", value: "37", prev: "28", delta: { value: 9, goodWhen: "down", unit: "" } },
    { layer: "R", metric: "Wk-4 account retention", sub: "cohort", value: "88.5%", prev: "86.0%", delta: { value: 2.5, unit: " pts" } },
  ],
  finding: {
    title: "A third of successes never proved they worked.",
    body: "Of 1,284 runs marked complete, 428 closed on self_reported outcomes with no downstream reply event. Verified success — a lead that actually answered — sits at 41.6%, not 62%. The gap widened after Tuesday's prompt change to reply_to_lead.",
    query: "runs where status = 'self_reported' and reply_received = false",
    queryId: "q_8f21c",
  },
  question: "Which prompt version turns a self_reported close into a verified reply?",
};

function SectionLabel({ children, color }) {
  return (
    <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)", fontWeight: 600, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: color || "var(--text-subtle)", marginBottom: "6px" }}>
      {children}
    </div>
  );
}

function Wordmark({ size = 18 }) {
  const tick = { position: "absolute", bottom: 0, width: "1.5px", height: "0.28em", background: "var(--primary)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: `${size * 0.5}px` }}>
      <svg width={size * 1.35} height={size * 1.35} viewBox="0 0 64 64" fill="none" style={{ flex: "none" }}>
        <rect x="9" y="7" width="42" height="42" rx="9" stroke="var(--text)" strokeWidth="6"></rect>
        <rect x="42" y="40" width="16" height="16" fill="var(--primary)"></rect>
      </svg>
      <span style={{ position: "relative", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: size, letterSpacing: "-0.015em", color: "var(--text)", lineHeight: 1, paddingBottom: "0.3em", display: "inline-block" }}>
        toqar
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "1.5px", background: "var(--border-strong)" }}>
          <span style={{ ...tick, left: 0 }} />
          <span style={{ ...tick, left: "50%" }} />
          <span style={{ ...tick, right: 0 }} />
        </span>
      </span>
    </span>
  );
}

/* ---------------- EMAIL / PDF VARIANT ---------------- */
function EmailReport({ data }) {
  return (
    <div style={{ width: "640px", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", fontFamily: "var(--font-sans)", boxShadow: "var(--shadow-md)" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
        <div>
          <SectionLabel>Weekly insight report</SectionLabel>
          <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{data.partner}</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" }}>
            <EventChip name={data.agent} tone="primary" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-micro)", color: "var(--text-subtle)" }}>{data.week}</span>
          </div>
        </div>
        <Wordmark />
      </div>

      {/* headline finding */}
      <div style={{ padding: "20px 24px", background: "var(--primary-soft)", borderBottom: "1px solid var(--border)" }}>
        <SectionLabel color="var(--primary)">Headline finding</SectionLabel>
        <div style={{ fontSize: "22px", lineHeight: 1.3, fontWeight: 600, letterSpacing: "-0.01em", textWrap: "pretty" }}>{data.headline}</div>
      </div>

      {/* metrics */}
      <div style={{ padding: "20px 24px" }}>
        <SectionLabel>TOQAR metrics</SectionLabel>
        <MetricsTable rows={data.rows} />
      </div>

      {/* finding of the week */}
      <div style={{ padding: "4px 24px 20px" }}>
        <SectionLabel>Finding of the week</SectionLabel>
        <div style={{ fontSize: "var(--fs-h3)", fontWeight: 600, letterSpacing: "-0.01em", marginBottom: "8px" }}>{data.finding.title}</div>
        <p style={{ margin: 0, fontSize: "var(--fs-base)", lineHeight: 1.6, color: "var(--text-muted)", textWrap: "pretty" }}>{data.finding.body}</p>
        <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px dashed var(--border)", display: "flex", gap: "8px", alignItems: "center", fontSize: "var(--fs-caption)", color: "var(--text-subtle)", fontFamily: "var(--font-mono)" }}>
          <span style={{ color: "var(--primary)" }}>↳ traces to</span>
          <a href="#" style={{ color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: "2px" }}>{data.finding.queryId}</a>
          <span style={{ opacity: 0.7 }}>{data.finding.query}</span>
        </div>
      </div>

      {/* question you can now answer */}
      <div style={{ margin: "0 24px 24px", padding: "16px 18px", borderRadius: "var(--radius-md)", border: "1.5px solid var(--primary)", background: "var(--surface)" }}>
        <SectionLabel color="var(--primary)">Question you can now answer</SectionLabel>
        <div style={{ fontSize: "var(--fs-lead)", fontWeight: 500, lineHeight: 1.4, textWrap: "pretty" }}>{data.question}</div>
      </div>
    </div>
  );
}

/* ---------------- SLACK COMPACT VARIANT ---------------- */
function SlackReport({ data }) {
  return (
    <div style={{ width: "460px", background: "var(--surface)", color: "var(--text)", borderLeft: "3px solid var(--primary)", border: "1px solid var(--border)", borderLeftWidth: "3px", borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", padding: "14px 16px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <Wordmark size={14} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-subtle)" }}>{data.week}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontWeight: 600, fontSize: "var(--fs-body)" }}>{data.partner}</span>
        <EventChip name={data.agent} tone="primary" />
      </div>

      <p style={{ margin: "0 0 12px", fontSize: "var(--fs-body)", lineHeight: 1.45, fontWeight: 500, textWrap: "pretty" }}>{data.headline}</p>

      {/* compact metric rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "12px" }}>
        {data.rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
              <span style={{ width: "14px", height: "14px", borderRadius: "var(--radius-xs)", background: `var(--toqar-${r.layer.toLowerCase()})`, color: "#fff", fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{r.layer}</span>
              {r.metric}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-small)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
              {r.delta ? <DeltaBadge value={r.delta.value} goodWhen={r.delta.goodWhen} unit={r.delta.unit} format={r.delta.format} /> : null}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "var(--fs-small)", lineHeight: 1.45, color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
        <span style={{ fontWeight: 600, color: "var(--text)" }}>{data.finding.title}</span>{" "}
        <a href="#" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--primary)", textDecoration: "underline", textUnderlineOffset: "2px" }}>↳ {data.finding.queryId}</a>
      </div>

      <div style={{ marginTop: "10px", padding: "9px 11px", borderRadius: "var(--radius-sm)", background: "var(--primary-soft)", fontSize: "var(--fs-small)", fontWeight: 500, lineHeight: 1.4, color: "var(--text)" }}>
        <span style={{ color: "var(--primary)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)" }}>Q ▸ </span>{data.question}
      </div>
    </div>
  );
}

/**
 * WeeklyReport — Toqar's partner insight report. Two variants:
 *  - "email" (default): full one-page email / PDF layout
 *  - "slack": compact message-friendly card
 */
export function WeeklyReport({ variant = "email", data = SAMPLE_REPORT, ...rest }) {
  return variant === "slack" ? <SlackReport data={data} {...rest} /> : <EmailReport data={data} {...rest} />;
}

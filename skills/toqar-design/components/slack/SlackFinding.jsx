import React from "react";

/**
 * SlackFinding — a Toqar finding translated to Slack Block Kit constraints:
 * one section block (mrkdwn), a fields row, an actions row (max 2 buttons),
 * and a context line. Renders a realistic Slack message frame.
 */
export function SlackFinding({
  botName = "Toqar",
  timestamp = "9:14 AM",
  headline,
  summary,
  fields = [],
  buttons = ["Show the work", "Open in Toqar"],
  context,
  style,
  ...rest
}) {
  const slackFont = 'Lato, "Segoe UI", system-ui, -apple-system, sans-serif';
  const mrkdwn = (text) =>
    text.split(/(`[^`]+`)/g).map((part, i) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.86em", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", borderRadius: "3px", padding: "0 3px", color: "var(--failed)" }}>{part.slice(1, -1)}</code>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );

  return (
    <div
      style={{
        width: "480px", background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "12px 14px",
        fontFamily: slackFont, color: "var(--text)", fontSize: "15px", lineHeight: 1.46,
        display: "grid", gridTemplateColumns: "36px 1fr", gap: "0 10px",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
      {...rest}
    >
      {/* avatar: Toqar mark on teal */}
      <span style={{ width: "36px", height: "36px", borderRadius: "6px", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
          <rect x="9" y="7" width="42" height="42" rx="9" stroke="#fff" strokeWidth="6"></rect>
          <rect x="42" y="40" width="16" height="16" fill="#fff"></rect>
        </svg>
      </span>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
        {/* name row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontWeight: 900, fontSize: "15px" }}>{botName}</span>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-subtle)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", borderRadius: "2px", padding: "0 3px", letterSpacing: "0.02em" }}>APP</span>
          <span style={{ fontSize: "12px", color: "var(--text-subtle)" }}>{timestamp}</span>
        </div>

        {/* section block */}
        <div style={{ fontWeight: 700 }}>{mrkdwn(headline || "")}</div>
        {summary ? <div style={{ color: "var(--text-muted)" }}>{mrkdwn(summary)}</div> : null}

        {/* fields block (2-col, Block Kit style) */}
        {fields.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", margin: "2px 0" }}>
            {fields.map((f, i) => (
              <div key={i} style={{ fontSize: "13px" }}>
                <div style={{ fontWeight: 700, color: "var(--text-muted)" }}>{f.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: f.tone === "bad" ? "var(--failed)" : f.tone === "good" ? "var(--success)" : "var(--text)" }}>{f.value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {/* actions block — Block Kit caps practical buttons; keep ≤2 */}
        <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
          {buttons.slice(0, 2).map((b, i) => (
            <button key={i} style={{
              fontFamily: slackFont, fontSize: "13px", fontWeight: 700,
              padding: "5px 12px", borderRadius: "4px", cursor: "pointer",
              background: i === 0 ? "var(--primary)" : "var(--surface)",
              color: i === 0 ? "var(--primary-fg)" : "var(--text)",
              border: i === 0 ? "1px solid var(--primary)" : "1px solid var(--border-strong)",
            }}>{b}</button>
          ))}
        </div>

        {/* context block */}
        {context ? <div style={{ fontSize: "12px", color: "var(--text-subtle)", fontFamily: "var(--font-mono)" }}>{context}</div> : null}
      </div>
    </div>
  );
}

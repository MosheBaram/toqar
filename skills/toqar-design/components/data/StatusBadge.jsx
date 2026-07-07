import React from "react";

/**
 * StatusBadge — the verification state of a run or task.
 * Colors are semantic tokens so light/dark resolve automatically.
 */
const STATUS = {
  verified:      { label: "verified",      fg: "var(--success)",   bg: "var(--success-soft)",   dot: "var(--success)" },
  self_reported: { label: "self_reported", fg: "var(--text-muted)",bg: "var(--surface-2)",      dot: "var(--text-subtle)" },
  failed:        { label: "failed",        fg: "var(--failed)",    bg: "var(--failed-soft)",    dot: "var(--failed)" },
  abandoned:     { label: "abandoned",     fg: "var(--abandoned)", bg: "var(--abandoned-soft)", dot: "var(--abandoned)" },
  handoff:       { label: "handoff",       fg: "var(--handoff)",   bg: "var(--handoff-soft)",   dot: "var(--handoff)" },
  autonomous:    { label: "autonomous",    fg: "var(--autonomous)",bg: "var(--autonomous-soft)",dot: "var(--autonomous)" },
};

export function StatusBadge({ status = "verified", label, dot = true, style, ...rest }) {
  const s = STATUS[status] || STATUS.verified;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-micro)",
        fontWeight: 500,
        lineHeight: 1,
        padding: "3px 8px 3px 7px",
        borderRadius: "var(--radius-pill)",
        background: s.bg,
        color: s.fg,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot ? (
        <span style={{ width: "6px", height: "6px", borderRadius: "999px", background: s.dot, flex: "none" }} />
      ) : null}
      {label || s.label}
    </span>
  );
}

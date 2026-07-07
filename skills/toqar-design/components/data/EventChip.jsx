import React from "react";

/**
 * EventChip — renders an event / property name in mono, e.g. `step_executed`.
 * The atom of Toqar's data surfaces: any raw identifier that traces to the
 * event stream is shown as a chip so it reads as data, not prose.
 */
export function EventChip({ name, children, tone = "neutral", prefix, style, ...rest }) {
  const tones = {
    neutral: { bg: "var(--surface-2)", fg: "var(--text-muted)", bd: "var(--border)" },
    primary: { bg: "var(--primary-soft)", fg: "var(--primary)", bd: "transparent" },
    quiet:   { bg: "transparent", fg: "var(--text-subtle)", bd: "var(--border-subtle)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <code
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-micro)",
        fontWeight: 500,
        lineHeight: 1,
        padding: "3px 7px",
        borderRadius: "var(--radius-sm)",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {prefix ? <span style={{ opacity: 0.55 }}>{prefix}</span> : null}
      {name || children}
    </code>
  );
}

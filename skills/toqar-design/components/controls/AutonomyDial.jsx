import React from "react";

export const AUTONOMY_LEVELS = [
  {
    id: 0,
    name: "Read-only analysis",
    scope: "analysis.read",
    description: "The agent queries your event stream and posts findings. It cannot touch your repo.",
  },
  {
    id: 1,
    name: "Instrumentation PRs",
    scope: "repo.pr.instrumentation",
    description: "The agent may open pull requests that add or fix tracking calls. You review and merge.",
  },
  {
    id: 2,
    name: "Experiment PRs",
    scope: "repo.pr.experiment",
    description: "The agent may open pull requests that run guarded experiments (flags, prompt variants). You review and merge.",
  },
];

/**
 * AutonomyDial — the per-customer permission ladder. Deliberately not a fun
 * slider: each rung is an explicit, auditable grant, and every grant implies
 * the rungs below it. Raising a level requires confirmation by the caller.
 */
export function AutonomyDial({ level = 0, onChange, audit = {}, disabled = false, style, ...rest }) {
  return (
    <div
      role="radiogroup"
      aria-label="Agent autonomy level"
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", color: "var(--text)",
        overflow: "hidden", width: "100%", maxWidth: "560px",
        ...style,
      }}
      {...rest}
    >
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: "8px", background: "var(--surface-2)" }}>
        <span style={{ fontSize: "var(--fs-caption)", fontWeight: 600, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--text-subtle)" }}>Autonomy level</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-muted)" }}>level {level} of {AUTONOMY_LEVELS.length - 1}</span>
      </div>

      {AUTONOMY_LEVELS.map((l) => {
        const granted = l.id <= level;
        const active = l.id === level;
        const auditLine = audit[l.id];
        return (
          <button
            key={l.id}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange && onChange(l.id)}
            style={{
              display: "grid", gridTemplateColumns: "18px 1fr", gap: "2px 12px",
              width: "100%", textAlign: "left", padding: "12px 14px",
              background: active ? "var(--primary-soft)" : "var(--surface)",
              border: "none", borderBottom: l.id === AUTONOMY_LEVELS.length - 1 ? "none" : "1px solid var(--border-subtle)",
              cursor: disabled ? "default" : "pointer", color: "var(--text)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {/* rung marker: filled = granted, outline = not */}
            <span style={{
              width: "14px", height: "14px", marginTop: "3px", borderRadius: "var(--radius-xs)",
              background: granted ? "var(--primary)" : "transparent",
              border: granted ? "1.5px solid var(--primary)" : "1.5px solid var(--border-strong)",
              gridRow: "1 / span 3",
            }} />
            <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "var(--fs-body)", fontWeight: 600 }}>{l.id}. {l.name}</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: granted ? "var(--primary)" : "var(--text-subtle)" }}>{l.scope}</code>
            </span>
            <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", lineHeight: 1.5 }}>{l.description}</span>
            {auditLine ? (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-subtle)", marginTop: "2px" }}>
                granted by {auditLine.by} · {auditLine.date}
              </span>
            ) : null}
          </button>
        );
      })}

      <div style={{ padding: "9px 14px", borderTop: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-caption)", color: "var(--text-subtle)", background: "var(--surface-2)" }}>
        Each level includes the levels below it. All grants are logged.
      </div>
    </div>
  );
}

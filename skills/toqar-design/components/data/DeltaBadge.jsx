import React from "react";

/**
 * DeltaBadge — a week-over-week change that knows whether "up" is good.
 * For TSR, up is good; for cost-per-task or takeovers, up is bad. Color is
 * driven by *goodness*, never by raw sign — so a falling cost reads green.
 */
export function DeltaBadge({
  value,
  goodWhen = "up",     // "up" | "down" — which direction is desirable
  format,
  unit = "",
  arrow = true,
  size = "sm",
  style,
  ...rest
}) {
  const num = typeof value === "number" ? value : parseFloat(value);
  const dir = num > 0 ? "up" : num < 0 ? "down" : "flat";
  const good =
    dir === "flat" ? "flat" : dir === goodWhen ? "good" : "bad";

  const palette = {
    good: { fg: "var(--delta-good)", bg: "var(--delta-good-soft)" },
    bad:  { fg: "var(--delta-bad)",  bg: "var(--delta-bad-soft)" },
    flat: { fg: "var(--delta-flat)", bg: "var(--delta-flat-soft)" },
  }[good];

  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";

  const text =
    typeof format === "function"
      ? format(num)
      : `${num > 0 ? "+" : ""}${num}${unit}`;

  const dims =
    size === "md"
      ? { fs: "var(--fs-body)", pad: "3px 9px" }
      : { fs: "var(--fs-caption)", pad: "2px 7px" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "var(--font-mono)",
        fontSize: dims.fs,
        fontWeight: 600,
        lineHeight: 1,
        padding: dims.pad,
        borderRadius: "var(--radius-sm)",
        background: palette.bg,
        color: palette.fg,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {arrow && dir !== "flat" ? <span style={{ fontSize: "0.8em" }}>{glyph}</span> : null}
      {text}
    </span>
  );
}

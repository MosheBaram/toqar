import React from "react";

/**
 * Sparkline — tiny inline trend line for finding cards. Pure SVG, no axes.
 * The last point gets a dot; color defaults to the current text color.
 */
export function Sparkline({
  data = [],
  width = 96,
  height = 26,
  color = "var(--primary)",
  strokeWidth = 1.5,
  dot = true,
  style,
  ...rest
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth + 1.5;
  const px = (i) => pad + (i * (width - pad * 2)) / Math.max(data.length - 1, 1);
  const py = (v) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const points = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const last = data.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" style={{ display: "block", ...style }} {...rest}>
      <polyline points={points} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      {dot ? <circle cx={px(last)} cy={py(data[last])} r={strokeWidth + 1} fill={color} /> : null}
    </svg>
  );
}

import * as React from "react";

export interface DeltaBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The change amount. Sign sets the arrow; goodWhen sets the color. */
  value: number | string;
  /** Which direction is desirable. Default "up". Use "down" for cost, latency, takeovers. */
  goodWhen?: "up" | "down";
  /** Custom formatter for the numeric label, e.g. v => `$${Math.abs(v)}`. */
  format?: (n: number) => string;
  /** Unit suffix appended to the default label, e.g. "pts", "%". */
  unit?: string;
  /** Show the directional arrow. Default true. */
  arrow?: boolean;
  /** "sm" (default) | "md". */
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

/**
 * Direction-aware week-over-week delta badge. Color follows *goodness*, not sign.
 */
export function DeltaBadge(props: DeltaBadgeProps): JSX.Element;

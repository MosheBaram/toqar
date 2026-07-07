import * as React from "react";

export interface SparklineProps extends React.SVGAttributes<SVGSVGElement> {
  /** Series values, oldest → newest. */
  data: number[];
  /** Default 96. */
  width?: number;
  /** Default 26. */
  height?: number;
  /** Stroke color. Default var(--primary). */
  color?: string;
  strokeWidth?: number;
  /** Dot on the last point. Default true. */
  dot?: boolean;
  style?: React.CSSProperties;
}

/** Tiny inline trend line (no axes) for finding cards and table cells. */
export function Sparkline(props: SparklineProps): JSX.Element;

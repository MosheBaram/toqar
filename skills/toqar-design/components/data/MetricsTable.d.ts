import * as React from "react";

export interface MetricRow {
  /** TOQAR layer key, renders an accent square. */
  layer?: "T" | "O" | "Q" | "A" | "R";
  /** Metric name. */
  metric: string;
  /** Optional mono sub-label (e.g. the underlying event/query). */
  sub?: string;
  /** This-week value (pre-formatted string or number). */
  value: React.ReactNode;
  /** Last-week value. */
  prev?: React.ReactNode;
  /** Direction-aware delta — passed straight to DeltaBadge. */
  delta?: {
    value: number;
    goodWhen?: "up" | "down";
    unit?: string;
    format?: (n: number) => string;
  };
}

/**
 * Props for MetricsTable.
 * @startingPoint section="Data" subtitle="TOQAR weekly metrics table" viewport="640x360"
 */
export interface MetricsTableProps extends React.HTMLAttributes<HTMLTableElement> {
  rows: MetricRow[];
  /** Show the TOQAR layer accent column. Default true. */
  showLayer?: boolean;
  /** Show the previous-period column. Default true. */
  showPrev?: boolean;
  /** Column header labels. */
  columns?: { value?: string; prev?: string; delta?: string };
  style?: React.CSSProperties;
}

/**
 * Toqar's canonical metrics table — mono tabular values, TOQAR layer accents,
 * direction-aware deltas.
 */
export function MetricsTable(props: MetricsTableProps): JSX.Element;

import * as React from "react";
import type { ToqarLayer } from "../feed/FindingCard";

export interface EvidenceStep {
  /** What the agent checked, e.g. "Segment failed runs by tool call". */
  title: string;
  /** Optional one-line observation. */
  note?: string;
  /** The exact query, shown as a copyable mono block. */
  query?: string;
  queryId?: string;
  /** Step result — mini table, single stat, or sparkline. */
  result?:
    | { type: "table"; columns: string[]; rows: (string | number)[][] }
    | { type: "stat"; value: string; label?: string; delta?: { value: number; goodWhen?: "up" | "down"; unit?: string; format?: (n: number) => string } }
    | { type: "spark"; data: number[]; label?: string; color?: string };
}

export interface EvidenceDrilldownProps extends React.HTMLAttributes<HTMLElement> {
  /** TOQAR layer accent of the parent finding. */
  layer?: ToqarLayer;
  /** Restates the finding headline. */
  title?: string;
  steps: EvidenceStep[];
  /** Closing sentence, rendered in a teal-soft band. */
  conclusion?: string;
  /** Renders the "collapse ↑" affordance. */
  onCollapse?: () => void;
  style?: React.CSSProperties;
}

/** The expanded finding: step-by-step investigation chain with copyable queries. */
export function EvidenceDrilldown(props: EvidenceDrilldownProps): JSX.Element;

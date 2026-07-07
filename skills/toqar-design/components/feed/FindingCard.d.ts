import * as React from "react";

export type FindingVariant = "anomaly" | "regression" | "experiment" | "digest";
export type FindingSeverity = "critical" | "warning" | "info" | "positive";
export type ToqarLayer = "T" | "O" | "Q" | "A" | "R";

export interface AnomalyMetric {
  label: string;
  value: string;
  /** Series for the sparkline, oldest → newest. */
  spark?: number[];
  sparkColor?: string;
  delta?: { value: number; goodWhen?: "up" | "down"; unit?: string; format?: (n: number) => string };
}
export interface RegressionMetric {
  before: string;
  after: string;
  fromVersion: string;
  toVersion: string;
  delta?: AnomalyMetric["delta"];
}
export interface ExperimentMetric {
  verdict: "ship" | "revert" | "inconclusive";
  arms?: { name: string; value: string }[];
}
export interface DigestMetric {
  layers: { layer: ToqarLayer; value: string; delta?: AnomalyMetric["delta"] }[];
}

/**
 * Props for FindingCard.
 * @startingPoint section="Feed" subtitle="Agent finding card" viewport="620x260"
 */
export interface FindingCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Card shape. Default "anomaly". */
  variant?: FindingVariant;
  /** TOQAR layer accent. */
  layer?: ToqarLayer;
  severity?: FindingSeverity;
  /** One declarative sentence. */
  headline: string;
  /** 2–3 sentence agent narrative. */
  summary?: string;
  /** Shape depends on variant. */
  metric?: AnomalyMetric | RegressionMetric | ExperimentMetric | DigestMetric;
  /** task_type / segment identifiers, rendered as quiet EventChips. */
  chips?: string[];
  timestamp?: string;
  /** Number of investigation steps; renders the "show the work" affordance. */
  workSteps?: number;
  /** Linked query id, e.g. "q_8f21c". */
  queryId?: string;
  onShowWork?: () => void;
  style?: React.CSSProperties;
}

/** TOQAR layer key square (also exported for reuse in pages). */
export function LayerKey(props: { layer: ToqarLayer; size?: number }): JSX.Element;

/** The core unit of the Toqar feed — an agent-posted narrative finding. */
export function FindingCard(props: FindingCardProps): JSX.Element;

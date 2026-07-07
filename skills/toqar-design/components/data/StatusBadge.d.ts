import * as React from "react";

export type RunStatus =
  | "verified"
  | "self_reported"
  | "failed"
  | "abandoned"
  | "handoff"
  | "autonomous";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Verification / lifecycle state of the run. Default "verified". */
  status?: RunStatus;
  /** Override the displayed text (defaults to the status name). */
  label?: string;
  /** Show the leading status dot. Default true. */
  dot?: boolean;
  style?: React.CSSProperties;
}

/**
 * Pill badge for a run's verification state (verified / self_reported / failed / abandoned …).
 */
export function StatusBadge(props: StatusBadgeProps): JSX.Element;

import * as React from "react";

export interface AutonomyAuditEntry {
  /** Who granted this level, e.g. "m.chen". */
  by: string;
  /** When, e.g. "2026-06-12". */
  date: string;
}

export interface AutonomyDialProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current granted level: 0 read-only analysis · 1 instrumentation PRs · 2 experiment PRs. */
  level?: 0 | 1 | 2;
  /** Called with the clicked level. Caller owns confirmation before raising. */
  onChange?: (level: number) => void;
  /** Audit lines keyed by level id. */
  audit?: Record<number, AutonomyAuditEntry>;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** The fixed three-rung ladder definition (id, name, scope, description). */
export const AUTONOMY_LEVELS: { id: number; name: string; scope: string; description: string }[];

/** Per-customer permission ladder: read-only analysis → instrumentation PRs → experiment PRs. */
export function AutonomyDial(props: AutonomyDialProps): JSX.Element;

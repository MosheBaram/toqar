import * as React from "react";

export interface EventChipProps extends React.HTMLAttributes<HTMLElement> {
  /** The event or property identifier, e.g. "task_completed". */
  name?: string;
  /** Alternative to `name`. */
  children?: React.ReactNode;
  /** Visual tone. Default "neutral". */
  tone?: "neutral" | "primary" | "quiet";
  /** Optional dimmed prefix, e.g. "event:" or "prop:". */
  prefix?: string;
  style?: React.CSSProperties;
}

/**
 * Mono chip for an event / property name (`step_executed`).
 */
export function EventChip(props: EventChipProps): JSX.Element;

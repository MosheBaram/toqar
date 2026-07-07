import * as React from "react";

export interface SlackField {
  label: string;
  /** Mono value; tone tints it. */
  value: string;
  tone?: "good" | "bad" | "neutral";
}

export interface SlackFindingProps extends React.HTMLAttributes<HTMLDivElement> {
  botName?: string;
  timestamp?: string;
  /** Bold first line. Backtick spans render as inline code. */
  headline: string;
  /** Body text; backtick spans render as inline code. */
  summary?: string;
  /** Block Kit fields (2-column). */
  fields?: SlackField[];
  /** Action buttons — Block Kit-practical max of 2 is enforced. */
  buttons?: string[];
  /** Mono context footer, e.g. "reply_to_lead · q_8f21c · 6 steps". */
  context?: string;
  style?: React.CSSProperties;
}

/** A Toqar finding translated to Slack Block Kit constraints (section, fields, actions, context). */
export function SlackFinding(props: SlackFindingProps): JSX.Element;

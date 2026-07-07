import * as React from "react";
import type { MetricRow } from "../components/data/MetricsTable";

export interface ReportData {
  partner: string;
  agent: string;
  week: string;
  headline: string;
  rows: MetricRow[];
  finding: { title: string; body: string; query: string; queryId: string };
  question: string;
}

/**
 * Props for WeeklyReport.
 * @startingPoint section="Report" subtitle="Weekly partner insight report" viewport="720x1000"
 */
export interface WeeklyReportProps {
  /** "email" (full page / PDF) or "slack" (compact message card). Default "email". */
  variant?: "email" | "slack";
  /** Report content. Defaults to the built-in AI-SDR sample. */
  data?: ReportData;
}

/** Built-in AI-SDR sample (reply_to_lead). */
export const SAMPLE_REPORT: ReportData;

/**
 * Toqar weekly partner insight report — email/PDF and Slack-compact variants.
 */
export function WeeklyReport(props: WeeklyReportProps): JSX.Element;

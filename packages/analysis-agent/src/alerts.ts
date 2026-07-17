import { compileMetric, detectAnomaliesZScore, type MetricArgs, type QueryExecutor } from '@toqar/analysis';

/**
 * Alert evaluation (spec: alerting): conditions evaluate against REAL
 * computed values — a threshold alert carries the metric's cited value
 * (its q_ id), an anomaly alert reflects the deterministic primitive's
 * actual output. No LLM invents a severity or a number. Delivery goes
 * through an injected sender; the outcome (delivered/failed) is recorded
 * by the caller — a quiet window with no data never fabricates "all
 * clear", it records fired=false with what was computed.
 */

export interface AlertDefinition {
  id: string;
  name: string;
  kind: 'threshold' | 'anomaly' | 'eval_regression';
  config: Record<string, unknown>;
  route: { channel: 'slack' | 'webhook'; url: string };
}

export interface AlertEvaluation {
  alert_id: string;
  fired: boolean;
  value?: number | undefined;
  query_id?: string | undefined;
  message?: string | undefined;
}

export interface AlertSender {
  deliver(route: AlertDefinition['route'], message: string): Promise<void>;
}

/** Webhook/Slack-webhook sender — both are a JSON POST; failures throw. */
export function createWebhookSender(fetchImpl: typeof fetch = fetch): AlertSender {
  return {
    async deliver(route, message) {
      const body = route.channel === 'slack' ? { text: message } : { message };
      const res = await fetchImpl(route.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`delivery failed: ${res.status}`);
    },
  };
}

export async function evaluateThresholdAlert(
  alert: AlertDefinition,
  executor: QueryExecutor,
  window: MetricArgs,
): Promise<AlertEvaluation> {
  const metric = String(alert.config.metric);
  const above = alert.config.above as number | undefined;
  const below = alert.config.below as number | undefined;
  const query = compileMetric(metric, window);
  const rows = await executor.execute(query);
  const value = Number(rows[0]?.value ?? NaN);
  if (!Number.isFinite(value)) {
    // No data: recorded honestly as not-fired-with-no-value, never "ok".
    return { alert_id: alert.id, fired: false, query_id: query.id, message: 'no data in window' };
  }
  const fired = (above !== undefined && value > above) || (below !== undefined && value < below);
  return {
    alert_id: alert.id,
    fired,
    value,
    query_id: query.id,
    message: fired
      ? `${alert.name}: ${metric} = ${value} (${above !== undefined ? `above ${above}` : `below ${below}`}) ↳ ${query.id}`
      : undefined,
  };
}

/**
 * Anomaly alert over a metric series: the caller supplies the per-bucket
 * series (each value computed by a cited query); the deterministic
 * primitive decides.
 */
export function evaluateAnomalyAlert(
  alert: AlertDefinition,
  series: { value: number; query_id: string }[],
): AlertEvaluation {
  const threshold = Number(alert.config.z_threshold ?? 3);
  const verdicts = detectAnomaliesZScore(series.map((p) => p.value), { threshold });
  const last = verdicts[verdicts.length - 1];
  const lastPoint = series[series.length - 1];
  const fired = Boolean(last?.anomalous);
  return {
    alert_id: alert.id,
    fired,
    value: lastPoint?.value,
    query_id: lastPoint?.query_id,
    message: fired
      ? `${alert.name}: latest value ${lastPoint?.value} is anomalous (|z| > ${threshold}) ↳ ${lastPoint?.query_id}`
      : undefined,
  };
}

/**
 * Eval-regression alert: the mean judged/code score of the current window
 * against the previous one (both computed from stored scores — a cache of
 * nothing). Judge-signal caveat travels with the message: directional,
 * carries the evaluator id, no q_ citation to fake.
 */
export function evaluateEvalRegressionAlert(
  alert: AlertDefinition,
  scores: { current: number[]; previous: number[] },
): AlertEvaluation {
  const drop = Number(alert.config.max_drop ?? 0.1);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const cur = mean(scores.current);
  const prev = mean(scores.previous);
  if (cur === null || prev === null) {
    return { alert_id: alert.id, fired: false, message: 'insufficient eval scores to compare' };
  }
  const fired = prev - cur > drop;
  return {
    alert_id: alert.id,
    fired,
    value: cur,
    message: fired
      ? `${alert.name}: mean eval score dropped ${(prev - cur).toFixed(3)} (${prev.toFixed(3)} → ${cur.toFixed(3)}) for evaluator ${String(alert.config.evaluator_id)} — judged signal, directional`
      : undefined,
  };
}

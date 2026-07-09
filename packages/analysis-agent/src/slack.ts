import type { Finding } from '@toqar/registry';
import type { QueryExecutor } from '@toqar/analysis';
import { fmt, runMetric, type Window } from './playbooks.js';

/**
 * Slack delivery (spec: slack-delivery): findings translate to Block Kit
 * following the D2 SlackFinding shape — section, fields, ≤2 actions,
 * mono context with query ids. Delivery is fire-and-forget with a
 * recorded outcome; Slack being down never blocks publication.
 */

export interface SlackBlock {
  type: 'section' | 'actions' | 'context';
  [key: string]: unknown;
}

export function renderFindingBlocks(
  finding: Finding,
  opts: { findingUrl?: string },
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${finding.headline}*` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: finding.summary },
      fields: finding.metrics.map((m) => ({
        type: 'mrkdwn',
        text: `*${m.label}*\n\`${m.value}\``,
      })),
    },
    {
      type: 'actions',
      elements: [
        ...(opts.findingUrl
          ? [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open in Toqar' },
                url: opts.findingUrl,
                style: 'primary',
              },
            ]
          : []),
      ].slice(0, 2),
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: finding.evidence.map((s) => `\`${s.query_id}\``).join(' · '),
        },
      ],
    },
  ];
  return blocks;
}

export interface DeliveryOptions {
  webhookUrl: string;
  findingUrl?: string;
  /** Persists the attempt outcome (finding_deliveries in the backend). */
  record: (status: 'delivered' | 'failed', detail?: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}

export async function deliverToSlack(finding: Finding, opts: DeliveryOptions): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(opts.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        blocks: renderFindingBlocks(finding, {
          ...(opts.findingUrl ? { findingUrl: opts.findingUrl } : {}),
        }),
      }),
    });
    if (res.ok) {
      await opts.record('delivered');
    } else {
      await opts.record('failed', `webhook responded ${res.status}`);
    }
  } catch (err) {
    await opts.record('failed', (err as Error).message);
  }
}

/** The five-row TOQAR snapshot from the validation weekly report. */
const DIGEST_METRICS: { metric: string; label: string; format: (v: unknown) => string }[] = [
  { metric: 'task_success_rate', label: 'Task success rate', format: fmt.pct },
  { metric: 'cost_per_completed_task', label: 'Cost / completed task', format: fmt.usd },
  { metric: 'autonomy_rate', label: 'Autonomy rate', format: fmt.pct },
  { metric: 'override_rate', label: 'Override/takeover rate', format: fmt.pct },
  { metric: 'weekly_task_actors', label: 'Weekly task actors', format: fmt.count },
];

/**
 * The weekly digest: the validation-era report structure with every
 * number computed and cited (spec: Weekly-digest scenario).
 */
export async function buildWeeklyDigest(args: {
  executor: QueryExecutor;
  window: Window;
}): Promise<Finding> {
  const metrics: Finding['metrics'] = [];
  const evidence: Finding['evidence'] = [];

  for (const row of DIGEST_METRICS) {
    const { query, rows } = await runMetric(args.executor, row.metric, args.window);
    if (rows.length === 0) continue;
    const value = row.format(rows[0]?.value);
    metrics.push({ label: row.metric, value, query_id: query.id });
    evidence.push({ title: row.label, query_id: query.id });
  }

  const tsr = metrics.find((m) => m.label === 'task_success_rate');
  return {
    layer: 'T',
    severity: 'info',
    variant: 'digest',
    headline: tsr
      ? `Weekly TOQAR snapshot: task success at ${tsr.value}.`
      : 'Weekly TOQAR snapshot.',
    summary:
      'The five-layer snapshot for the week — every value links to the query that computed it.',
    metrics,
    evidence,
  };
}

import type { QueryExecutor } from '@toqar/analysis';
import { fmt, runMetric, type Window } from './playbooks.js';

/**
 * Question answering for the eval harness (spec: the question log is
 * the eval). v0 routes by keyword to a playbook — honest about its
 * limits: an unroutable question gets "cannot answer", never a guess.
 * LLM-assisted routing can replace the table without changing the
 * contract: computed, cited numbers only.
 */

export interface Answer {
  routed_playbook: string | null;
  text: string;
  metrics: { label: string; value: string; query_id: string }[];
  query_ids: string[];
}

const ROUTES: { playbook: string; match: RegExp }[] = [
  { playbook: 'cost', match: /cost|spend|expensive|price|token/i },
  { playbook: 'success', match: /success|fail|complet|abandon/i },
  { playbook: 'autonomy', match: /takeover|autonom|handoff|escalat|override|human/i },
];

export async function answerQuestion(
  question: string,
  executor: QueryExecutor,
  window: Window,
): Promise<Answer> {
  const route = ROUTES.find((r) => r.match.test(question));
  if (!route) {
    return {
      routed_playbook: null,
      text: 'I cannot answer this from the current playbooks — logged for playbook expansion.',
      metrics: [],
      query_ids: [],
    };
  }

  const metrics: Answer['metrics'] = [];
  const lines: string[] = [];

  if (route.playbook === 'cost') {
    const cpct = await runMetric(executor, 'cost_per_completed_task', window);
    const cpctValue = fmt.usd(cpct.rows[0]?.value);
    metrics.push({ label: 'cost_per_completed_task', value: cpctValue, query_id: cpct.query.id });
    lines.push(`Cost per completed task is ${cpctValue} over the window (${cpct.query.id}).`);

    const tools = await runMetric(executor, 'per_tool_failure_rate', window);
    const top = [...tools.rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
    if (top) {
      const share = fmt.pct(top.value);
      metrics.push({ label: `failure_rate:${String(top.tool_name)}`, value: share, query_id: tools.query.id });
      lines.push(
        `${String(top.tool_name)} has the highest failure rate at ${share} — failed steps get retried, and retries are paid for (${tools.query.id}).`,
      );
    }

    const tokens = await runMetric(executor, 'tokens_per_task', window);
    if (tokens.rows.length) {
      const perTask = fmt.count(tokens.rows[0]?.value);
      metrics.push({ label: 'tokens_per_task', value: perTask, query_id: tokens.query.id });
      lines.push(`Tokens per task: ${perTask} (${tokens.query.id}).`);
    }
  } else if (route.playbook === 'success') {
    const tsr = await runMetric(executor, 'task_success_rate', window);
    const value = fmt.pct(tsr.rows[0]?.value);
    metrics.push({ label: 'task_success_rate', value, query_id: tsr.query.id });
    lines.push(`Task success rate is ${value} over the window (${tsr.query.id}).`);
  } else {
    const autonomy = await runMetric(executor, 'autonomy_rate', window);
    const value = fmt.pct(autonomy.rows[0]?.value);
    metrics.push({ label: 'autonomy_rate', value, query_id: autonomy.query.id });
    lines.push(`Autonomy rate is ${value} over the window (${autonomy.query.id}).`);
  }

  return {
    routed_playbook: route.playbook,
    text: lines.join('\n'),
    metrics,
    query_ids: metrics.map((m) => m.query_id),
  };
}

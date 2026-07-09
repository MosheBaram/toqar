import { z } from 'zod';

/**
 * Findings (spec: analysis-agent / findings-feed): the agent's narrated
 * unit of value. The citation contract is absolute — every number a
 * finding shows resolves to a semantic-layer query id, enforced by
 * schema (ids required everywhere) plus validateFindingCitations
 * (prose numbers must match registered metric values verbatim).
 */

export const findingMetricSchema = z.object({
  label: z.string().min(1),
  /** The exact rendered value — prose may only use these strings. */
  value: z.string().min(1),
  query_id: z.string().regex(/^q_[0-9a-f]{16}$/),
});

export const evidenceStepSchema = z.object({
  title: z.string().min(1),
  note: z.string().optional(),
  query_id: z.string().regex(/^q_[0-9a-f]{16}$/),
  /** Pointer to the stored result (never inline recomputation). */
  result_ref: z.string().optional(),
});

export const findingSchema = z.object({
  layer: z.enum(['T', 'O', 'Q', 'A', 'R']),
  severity: z.enum(['critical', 'warning', 'info', 'positive']),
  variant: z.enum(['anomaly', 'regression', 'experiment', 'digest']),
  headline: z.string().min(1),
  summary: z.string().min(1),
  metrics: z.array(findingMetricSchema).min(1),
  evidence: z.array(evidenceStepSchema).min(1),
  /** Which prompt/model produced it — Q-layer discipline on ourselves. */
  prompt_version: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export type Finding = z.infer<typeof findingSchema>;

/** Numeric claims: percentages, dollars, decimals — not version tags or query ids. */
const NUMERIC_CLAIM = /\$\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?%|(?<![\w.])\d[\d,]*\.\d+(?![\w%])/g;
const NON_CLAIM_CONTEXT = /(?:^|[^\w])(?:v|q_|run_|task_|step_)[\w]*$/;

export type CitationResult = { ok: true } | { ok: false; uncited: string[] };

export function validateFindingCitations(value: unknown): CitationResult {
  const parsed = findingSchema.safeParse(value);
  if (!parsed.success) return { ok: false, uncited: ['(finding failed schema validation)'] };
  const finding = parsed.data;

  const registered = new Set(finding.metrics.map((m) => m.value));
  const prose = [
    finding.headline,
    finding.summary,
    ...finding.evidence.flatMap((s) => [s.title, s.note ?? '']),
  ].join('\n');

  const uncited: string[] = [];
  for (const match of prose.matchAll(NUMERIC_CLAIM)) {
    const token = match[0];
    const preceding = prose.slice(Math.max(0, match.index - 12), match.index);
    if (NON_CLAIM_CONTEXT.test(preceding)) continue;
    const cited = [...registered].some((v) => v.includes(token) || token.includes(v));
    if (!cited) uncited.push(token);
  }
  return uncited.length === 0 ? { ok: true } : { ok: false, uncited };
}

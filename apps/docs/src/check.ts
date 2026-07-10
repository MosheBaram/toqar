import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TOQAR_EVENT_NAMES } from '@toqar/registry';
import { listMetrics } from '@toqar/analysis';

/**
 * Cross-reference gate (spec: public-docs): docs may only claim events and
 * metrics that exist in the shipped code. Each doc declares its claims in a
 * machine-checkable comment:
 *
 *   <!-- claims: events=task_completed,step_executed metrics=task_success_rate -->
 *
 * The build fails on any claim with no backing code — the anti-slop
 * "no aspirational documentation" rule made mechanical.
 */

export interface CheckResult {
  checked: number;
  violations: string[];
}

const CLAIMS_RE = /<!--\s*claims:\s*([^>]*?)-->/g;

function parseClaims(body: string): { events: string[]; metrics: string[] } {
  const events: string[] = [];
  const metrics: string[] = [];
  for (const match of body.matchAll(CLAIMS_RE)) {
    const spec = match[1] ?? '';
    for (const part of spec.trim().split(/\s+/)) {
      const [key, list] = part.split('=');
      if (!list) continue;
      const names = list.split(',').map((s) => s.trim()).filter(Boolean);
      if (key === 'events') events.push(...names);
      if (key === 'metrics') metrics.push(...names);
    }
  }
  return { events, metrics };
}

export async function checkDocs(dir: string): Promise<CheckResult> {
  const events = new Set<string>(TOQAR_EVENT_NAMES);
  const metrics = new Set(listMetrics().map((m) => m.name));
  const violations: string[] = [];
  let checked = 0;

  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  } catch {
    return { checked: 0, violations: [`docs directory not found: ${dir}`] };
  }

  for (const file of files) {
    checked += 1;
    const body = await readFile(join(dir, file), 'utf8');
    const claims = parseClaims(body);
    for (const e of claims.events) {
      if (!events.has(e)) violations.push(`${file}: claims event "${e}" which is not in TOQAR_EVENT_NAMES`);
    }
    for (const m of claims.metrics) {
      if (!metrics.has(m)) violations.push(`${file}: claims metric "${m}" which is not in the semantic-layer catalog`);
    }
  }

  return { checked, violations };
}

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Seam, SeamMap } from '@toqar/registry';

/**
 * Deterministic seam scanner (design D4: the LLM decides where to look;
 * this code does the looking). Heuristics are versioned with the agent —
 * they must be honest about their limits, hence the refusal path.
 */

export type ScanResult =
  | { supported: true; seamMap: SeamMap }
  | { supported: false; reason: string };

export interface ScanOptions {
  repo: string;
  agentVersion: string;
  now: () => string;
}

const STACK_DEPS: Record<string, string> = {
  express: 'express',
  react: 'react',
  '@anthropic-ai/sdk': 'anthropic-sdk',
  openai: 'openai-sdk',
  ai: 'vercel-ai',
};

const LLM_CALL = /\.messages\.create\(|generateText\(|chat\.completions/;
const EXPRESS_ROUTE = /\b(app|router)\.(get|post|put|patch|delete)\(/;
const EXPORTED_ASYNC_FN = /^export (?:default )?async function (\w+)/;
const LOCAL_IMPORT = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+'(\.[^']+)'/;
const OUTCOME_RETURN = /return '(\w+)'/;
const HANDOFF_NAME = /approv|handoff|review|escalat/i;

function camelToSnake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

async function listSourceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        out.push(path);
      }
    }
  }
  await walk(root);
  return out.sort();
}

export async function scanRepo(repoPath: string, opts: ScanOptions): Promise<ScanResult> {
  let pkgRaw: string;
  try {
    pkgRaw = await readFile(join(repoPath, 'package.json'), 'utf8');
  } catch {
    return {
      supported: false,
      reason: 'no package.json found — the agent supports TypeScript/Node repos only',
    };
  }

  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return { supported: false, reason: 'unreadable package.json' };
  }

  const frameworks = Object.entries(STACK_DEPS)
    .filter(([dep]) => dep in deps)
    .map(([, name]) => name);
  if (frameworks.length === 0) {
    return {
      supported: false,
      reason: `no recognized agent stack in dependencies (looked for: ${Object.keys(STACK_DEPS).join(', ')}) — unsupported for now, and the agent does not guess`,
    };
  }

  const seams: Seam[] = [];
  const taxonomy = new Set<string>();

  for (const file of await listSourceFiles(repoPath)) {
    const rel = relative(repoPath, file);
    const lines = (await readFile(file, 'utf8')).split('\n');

    const localIdents = new Set<string>();
    for (const line of lines) {
      const m = LOCAL_IMPORT.exec(line);
      if (m) {
        for (const ident of (m[1] ?? m[2] ?? '').split(',')) {
          const name = ident.trim().split(' as ').pop()?.trim();
          if (name) localIdents.add(name);
        }
      }
    }

    const fileHasLlm = lines.some((l) => LLM_CALL.test(l));
    let inTaskFile = false;

    lines.forEach((line, i) => {
      const loc = `${rel}:${i + 1}`;

      if (LLM_CALL.test(line)) {
        seams.push({ kind: 'llm_call', location: loc });
        return;
      }

      const routeMatch = EXPRESS_ROUTE.exec(line);
      if (routeMatch && frameworks.includes('express')) {
        seams.push({ kind: 'task_start', location: loc, note: line.trim().slice(0, 80) });
        inTaskFile = true;
        const pathMatch = /'([^']+)'/.exec(line);
        if (pathMatch?.[1]) taxonomy.add(camelToSnake(pathMatch[1].replace(/\W+/g, '_').replace(/^_|_$/g, '')));
        return;
      }

      const fnMatch = EXPORTED_ASYNC_FN.exec(line);
      if (fnMatch?.[1] && fileHasLlm) {
        seams.push({ kind: 'task_start', location: loc, note: `export async function ${fnMatch[1]}` });
        taxonomy.add(camelToSnake(fnMatch[1]));
        inTaskFile = true;
        return;
      }

      const awaited = /await (\w+)\(/.exec(line);
      if (awaited?.[1] && localIdents.has(awaited[1])) {
        seams.push({
          kind: HANDOFF_NAME.test(awaited[1]) ? 'handoff' : 'tool_call',
          location: loc,
          note: awaited[1],
        });
        return;
      }

      if (inTaskFile && OUTCOME_RETURN.test(line)) {
        seams.push({ kind: 'outcome', location: loc, note: line.trim() });
      }
    });
  }

  return {
    supported: true,
    seamMap: {
      repo: opts.repo,
      frameworks,
      seams,
      task_taxonomy: [...taxonomy].sort(),
      agent_version: opts.agentVersion,
      produced_at: opts.now(),
    },
  };
}

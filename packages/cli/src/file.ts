import { readFile, writeFile } from 'node:fs/promises';
import { registryEntrySchema, type RegistryEntry } from '@toqar/registry';

/** Problems found in the registry file, each with its array index. */
export class RegistryFileError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'RegistryFileError';
  }
}

/**
 * Loads and validates the registry-as-code file: a JSON array of registry
 * entries. Every invalid entry and duplicate event is reported with its
 * index — the whole file is rejected on any problem.
 */
export async function loadRegistryFile(path: string): Promise<RegistryEntry[]> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new RegistryFileError([`cannot read registry file: ${path}`]);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new RegistryFileError([`invalid JSON: ${(err as Error).message}`]);
  }
  if (!Array.isArray(data)) {
    throw new RegistryFileError(['registry file must be a JSON array of entries']);
  }

  const problems: string[] = [];
  const seen = new Map<string, number>();
  const entries: RegistryEntry[] = [];

  data.forEach((value, i) => {
    const parsed = registryEntrySchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`[${i}] ${issue.path.join('.') || '(entry)'}: ${issue.message}`);
      }
      return;
    }
    const prior = seen.get(parsed.data.event);
    if (prior !== undefined) {
      problems.push(`[${i}] duplicate event "${parsed.data.event}" (first at [${prior}])`);
      return;
    }
    seen.set(parsed.data.event, i);
    entries.push(parsed.data);
  });

  if (problems.length > 0) throw new RegistryFileError(problems);
  return entries;
}

/** Writes entries to the file, sorted by event, stable formatting (pull mode). */
export async function writeRegistryFile(path: string, entries: RegistryEntry[]): Promise<void> {
  const sorted = [...entries].sort((a, b) => a.event.localeCompare(b.event));
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

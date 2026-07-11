#!/usr/bin/env node
// Contributor-docs drift check (spec: contributor-docs). Keeps the internal
// docs honest against the workspace — the anti-slop rule, one directory up
// from the public docs cross-reference gate. Fails the build when:
//   1. a package/app has no README,
//   2. a README's "## Dependencies" section claims a @toqar/* dependency the
//      package.json does not have,
//   3. a contributor doc references a scripts/*.sh or infra/*.yml path that
//      does not exist.
// Prose mentions are ignored: dependency claims are read only from the
// delimited "## Dependencies" section, by convention a table of @toqar/*.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];

function workspaceDirs() {
  const out = [];
  for (const base of ['packages', 'apps']) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const dir = join(base, name);
      if (existsSync(join(dir, 'package.json'))) out.push(dir);
    }
  }
  return out;
}

/** The body of the "## Dependencies" section, or null if there is none. */
function dependenciesSection(md) {
  const start = md.search(/^## Dependencies[ \t]*$/m);
  if (start === -1) return null;
  const after = md.indexOf('\n', start) + 1;
  const nextHeading = md.slice(after).search(/^## /m);
  return nextHeading === -1 ? md.slice(after) : md.slice(after, after + nextHeading);
}

for (const dir of workspaceDirs()) {
  const readmePath = join(dir, 'README.md');

  // 1. README presence.
  if (!existsSync(readmePath)) {
    problems.push(`missing README: ${readmePath}`);
    continue;
  }

  // 2. Declared @toqar dependencies match package.json.
  const section = dependenciesSection(readFileSync(readmePath, 'utf8'));
  if (section) {
    const claimed = new Set([...section.matchAll(/@toqar\/([a-z0-9-]+)/g)].map((m) => m[1]));
    if (claimed.size > 0) {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const deps = new Set(
        Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
          .filter((k) => k.startsWith('@toqar/'))
          .map((k) => k.slice('@toqar/'.length)),
      );
      for (const c of claimed) {
        if (!deps.has(c)) {
          problems.push(`${readmePath}: Dependencies section claims @toqar/${c}, not in package.json`);
        }
      }
    }
  }
}

// 3. Referenced scripts/infra paths in contributor docs exist.
for (const doc of ['README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md']) {
  if (!existsSync(doc)) continue;
  const text = readFileSync(doc, 'utf8');
  const refs = new Set(
    [...text.matchAll(/(scripts\/[A-Za-z0-9._-]+\.(?:sh|mjs)|infra\/[A-Za-z0-9._/-]+\.ya?ml)/g)].map((m) => m[1]),
  );
  for (const ref of refs) {
    if (!existsSync(ref)) problems.push(`${doc}: references missing path ${ref}`);
  }
}

if (problems.length > 0) {
  console.error('Contributor-docs drift check failed:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Contributor-docs drift check passed.');

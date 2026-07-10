import { fileURLToPath } from 'node:url';
import { checkDocs } from './check.js';

/**
 * The docs "build" is the cross-reference gate: it fails if any doc claims
 * an event or metric that doesn't exist in the shipped code. Publishing the
 * static markdown is downstream; this is the check that keeps docs honest.
 */
const contentDir = fileURLToPath(new URL('../content', import.meta.url));
const result = await checkDocs(contentDir);

if (result.violations.length > 0) {
  console.error(`docs cross-reference FAILED (${result.violations.length}):`);
  for (const v of result.violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`docs cross-reference OK: ${result.checked} files, all claims backed by code`);

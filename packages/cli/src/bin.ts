#!/usr/bin/env node
import { parseArgs } from './args.js';
import { runSync } from './sync.js';

const parsed = parseArgs(process.argv);
if (typeof parsed === 'string') {
  console.error(parsed);
  process.exit(1);
}

const result = await runSync({
  ...parsed,
  apiUrl: process.env.TOQAR_API_URL,
  token: process.env.TOQAR_TOKEN,
});
console.log(result.output);
process.exit(result.code);

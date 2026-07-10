#!/usr/bin/env node
import { parseArgs } from './args.js';
import { runInstrument } from './instrument.js';
import { runOnboard } from './onboard.js';
import { runSync } from './sync.js';

const parsed = parseArgs(process.argv);
if (typeof parsed === 'string') {
  console.error(parsed);
  process.exit(1);
}

const env = {
  apiUrl: process.env.TOQAR_API_URL,
  token: process.env.TOQAR_TOKEN,
};

const result =
  parsed.cmd === 'sync'
    ? await runSync({ mode: parsed.mode, filePath: parsed.filePath, ...env })
    : parsed.cmd === 'onboard'
      ? await runOnboard({ repoPath: parsed.path, ...env })
      : await runInstrument({ repoPath: parsed.path, approve: parsed.approve, ...env });

console.log(result.output);
process.exit(result.code);

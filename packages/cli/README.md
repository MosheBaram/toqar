# @toqar/cli

`toqar` — the command-line entry to the platform for developers and CI. It
drives registry-as-code sync, agent onboarding, and agent-driven
instrumentation with a hard review gate.

```
usage: toqar sync [--apply | --pull] [--file <path>]
       toqar instrument <path> [--approve]
       toqar onboard <path>
```

## Dependencies

| Package | Why |
| --- | --- |
| `@toqar/registry` | The registry-entry and tracking-plan types the CLI reads, diffs, and renders. |
| `@toqar/instrumentation-agent` | The instrumentation loop behind `toqar instrument` (seam scan → plan → PR) and `toqar onboard`. |
| `@toqar/registry-service` | The API client target: `sync` diffs/applies/pulls against the registry backend. |

## Commands

| Command | Purpose |
| --- | --- |
| `toqar sync` | Diff registry-as-code against the backend (default), `--apply` a local tracking plan, or `--pull` the backend into local files. `--file` points at the registry file. |
| `toqar instrument <path>` | Run the instrumentation agent over a repo: propose a tracking plan and assemble a PR. `--approve` proceeds past the review gate to implementation. |
| `toqar onboard <path>` | Onboard a repo — scan seams and produce the initial plan. |

## Environment

| Variable | Meaning |
| --- | --- |
| `TOQAR_API_URL` | Registry backend base URL (for `sync`). |
| `TOQAR_TOKEN` | Bearer token for the authenticated tenant. |

## Tests

```bash
pnpm --filter @toqar/cli test   # arg parsing, sync, onboard, instrument
```

`bin.ts` is the executable (`toqar`, built to `dist/bin.js`); the command
modules are unit-tested with the network and filesystem seams injected.

/**
 * Canonical-name rule (spec: findings-feed): core TOQAR events render by
 * their registry names. The D2 sample copy used display aliases — this
 * helper is the single place they normalize (recorded in
 * skills/toqar-design/SYNC.md).
 */
const CANONICAL_ALIASES: Record<string, string> = {
  human_takeover: 'human_overrode',
  run_abandoned: 'task_abandoned',
  tool_called: 'step_executed',
};

export function formatEventName(name: string): string {
  return CANONICAL_ALIASES[name] ?? name;
}

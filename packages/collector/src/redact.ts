/**
 * Redaction at ingest (spec: data-governance): sensitive values are
 * replaced BEFORE anything lands in the analytics store, across every
 * span type — user input, retrieved context, tool results, model output
 * all arrive here as event property strings.
 *
 * Two recognizer classes, deliberately distinct:
 * - personal PII (emails, phone numbers, credit cards with Luhn check,
 *   SSNs, IP addresses)
 * - source-code secrets/credentials (cloud keys, API tokens, private key
 *   blocks, bearer headers) — Toqar reads customers' repos, so leaked
 *   credentials are a first-class risk, not an afterthought.
 *
 * Honesty contract: this is deterministic pattern matching — best-effort
 * by construction, with NO recall guarantee. That caveat is part of the
 * spec and the docs; never present redaction as absolute.
 */

export interface Redaction {
  kind: string;
  count: number;
}

interface Recognizer {
  kind: string;
  pattern: RegExp;
  placeholder: string;
  /** Optional verifier to cut false positives (e.g. Luhn for cards). */
  verify?: (match: string) => boolean;
}

function luhn(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const SECRET_RECOGNIZERS: Recognizer[] = [
  { kind: 'aws_access_key', pattern: /AKIA[0-9A-Z]{16}/g, placeholder: '[REDACTED:aws_access_key]' },
  { kind: 'github_token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g, placeholder: '[REDACTED:github_token]' },
  { kind: 'anthropic_key', pattern: /sk-ant-[A-Za-z0-9-]{10,}/g, placeholder: '[REDACTED:anthropic_key]' },
  { kind: 'openai_key', pattern: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20,}/g, placeholder: '[REDACTED:openai_key]' },
  { kind: 'slack_token', pattern: /xox[bap]-[0-9A-Za-z-]{10,}/g, placeholder: '[REDACTED:slack_token]' },
  {
    kind: 'private_key_block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----|$)/g,
    placeholder: '[REDACTED:private_key]',
  },
  { kind: 'bearer_token', pattern: /\b[Bb]earer\s+[A-Za-z0-9._~+/-]{20,}=*/g, placeholder: '[REDACTED:bearer_token]' },
];

const PII_RECOGNIZERS: Recognizer[] = [
  {
    kind: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    placeholder: '[REDACTED:email]',
  },
  {
    kind: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    placeholder: '[REDACTED:ssn]',
  },
  {
    kind: 'credit_card',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    placeholder: '[REDACTED:credit_card]',
    verify: luhn,
  },
  {
    kind: 'phone',
    pattern: /(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,
    placeholder: '[REDACTED:phone]',
  },
  {
    kind: 'ipv4',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
    placeholder: '[REDACTED:ip]',
  },
];

export function redactText(text: string): { text: string; redactions: Redaction[] } {
  const counts = new Map<string, number>();
  let out = text;
  // Secrets first: a credential inside an email-shaped string should be
  // classified as the credential.
  for (const r of [...SECRET_RECOGNIZERS, ...PII_RECOGNIZERS]) {
    out = out.replace(r.pattern, (match) => {
      if (r.verify && !r.verify(match)) return match;
      counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
      return r.placeholder;
    });
  }
  return {
    text: out,
    redactions: [...counts.entries()].map(([kind, count]) => ({ kind, count })),
  };
}

/**
 * Structural fields analytics depends on — never redacted. Everything
 * else that is a string leaf gets the recognizers, whatever span type the
 * event represents.
 */
const STRUCTURAL_KEYS = new Set([
  'event',
  'event_id',
  'schema_version',
  'timestamp',
  'task_id',
  'run_id',
  'session_id',
  'task_type',
  'tenant_id',
  'step_id',
  'step_index',
  'step_type',
  'handoff_id',
  'tool_name',
  'model',
  'status',
  'verification',
  'initiator',
  'retry_of_step_id',
  'channel',
  'source',
  'kind',
  'unit',
  'abandoned_by',
  'reason',
  'blocking',
  'retryable',
  'verifier',
  'name',
  'version',
]);

export function redactEvent(event: Record<string, unknown>): {
  event: Record<string, unknown>;
  redactions: Redaction[];
} {
  const all = new Map<string, number>();

  const walk = (value: unknown, key: string | null): unknown => {
    if (typeof value === 'string') {
      if (key !== null && STRUCTURAL_KEYS.has(key)) return value;
      const { text, redactions } = redactText(value);
      for (const r of redactions) all.set(r.kind, (all.get(r.kind) ?? 0) + r.count);
      return text;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v, k)]),
      );
    }
    return value;
  };

  return {
    event: walk(event, null) as Record<string, unknown>,
    redactions: [...all.entries()].map(([kind, count]) => ({ kind, count })),
  };
}

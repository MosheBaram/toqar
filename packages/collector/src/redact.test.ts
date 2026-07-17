import { describe, expect, it } from 'vitest';
import { redactEvent, redactText } from './redact.js';

// Fixtures are ASSEMBLED at runtime so the repo's own secret scan never
// sees a contiguous credential-shaped literal in source.
const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const anthropicKey = ['sk', 'ant', 'api03-' + 'x'.repeat(24)].join('-');
const ghToken = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0'.repeat(2);
const slackToken = 'xoxb-' + '1234567890-abcdefghijk';
const pem = (part: string) => ['-----', part, ' RSA PRIVATE KEY', '-----'].join('');
const pemBlock = [pem('BEGIN'), 'MIIEow…snip…', pem('END')].join('\n');

describe('redactText', () => {
  it('redacts personal PII with typed placeholders', () => {
    const { text, redactions } = redactText(
      'Contact jane.doe@example.com or +1 415-555-0142, card 4111 1111 1111 1111, ssn 123-45-6789, host 203.0.113.7',
    );
    expect(text).toContain('[REDACTED:email]');
    expect(text).toContain('[REDACTED:phone]');
    expect(text).toContain('[REDACTED:credit_card]');
    expect(text).toContain('[REDACTED:ssn]');
    expect(text).toContain('[REDACTED:ip]');
    expect(text).not.toContain('jane.doe');
    expect(redactions.map((r) => r.kind).sort()).toEqual(['credit_card', 'email', 'ipv4', 'phone', 'ssn']);
  });

  it('redacts source-code secrets as a distinct class', () => {
    const { text, redactions } = redactText(
      `const k = "${awsKey}"; auth("${anthropicKey}"); gh("${ghToken}"); slack("${slackToken}");\n${pemBlock}`,
    );
    expect(text).toContain('[REDACTED:aws_access_key]');
    expect(text).toContain('[REDACTED:anthropic_key]');
    expect(text).toContain('[REDACTED:github_token]');
    expect(text).toContain('[REDACTED:slack_token]');
    expect(text).toContain('[REDACTED:private_key]');
    expect(text).not.toContain(awsKey);
    const kinds = redactions.map((r) => r.kind);
    expect(kinds).toContain('aws_access_key');
    expect(kinds).toContain('private_key_block');
  });

  it('does not fire on non-matching numbers (Luhn guard)', () => {
    const { text } = redactText('order 1234 5678 9012 3456 shipped'); // fails Luhn
    expect(text).toContain('1234 5678 9012 3456');
  });
});

describe('redactEvent', () => {
  const event = (extra: Record<string, unknown>) => ({
    event: 'step_executed',
    event_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    task_id: 'task_1',
    run_id: 'run_1',
    task_type: 'reply_to_lead',
    tool_name: 'crm_lookup',
    status: 'error',
    agent: { name: 'sdr-agent', version: '1.0.0' },
    ...extra,
  });

  it('redacts string leaves across nested structures (every span type)', () => {
    const { event: out, redactions } = redactEvent(
      event({
        error: { type: 'tool_error', message: `denied for bob@corp.com using ${awsKey}` },
        output_ref: 'artifact://runs/run_1/output',
      }),
    );
    const err = (out.error as { message: string }).message;
    expect(err).toContain('[REDACTED:email]');
    expect(err).toContain('[REDACTED:aws_access_key]');
    expect(redactions.length).toBeGreaterThan(0);
  });

  it('never touches structural analytics fields', () => {
    const { event: out } = redactEvent(event({}));
    expect(out.event).toBe('step_executed');
    expect(out.task_type).toBe('reply_to_lead');
    expect(out.tool_name).toBe('crm_lookup');
    expect((out.agent as { name: string }).name).toBe('sdr-agent');
  });
});

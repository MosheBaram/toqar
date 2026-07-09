import { toqarEventSchema } from '@toqar/registry';
import { describe, expect, it } from 'vitest';
import { mapResourceSpans, type OtlpResourceSpans } from './otel.js';

/** Vanilla OTLP/HTTP JSON shapes (what @opentelemetry/exporter-trace-otlp-http sends). */
function attr(key: string, value: string | number): Record<string, unknown> {
  return typeof value === 'number'
    ? { key, value: { intValue: String(value) } }
    : { key, value: { stringValue: value } };
}

const NS = 1_000_000_000n;

function span(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    traceId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    spanId: '1112131415161718',
    name: 'llm.call',
    startTimeUnixNano: String(1_752_000_000n * NS),
    endTimeUnixNano: String(1_752_000_002n * NS),
    attributes: [],
    status: { code: 1 },
    ...overrides,
  };
}

function resourceSpans(spans: Record<string, unknown>[], resourceAttrs: Record<string, unknown>[] = []): OtlpResourceSpans {
  return {
    resourceSpans: [
      {
        resource: { attributes: [attr('service.name', 'sdr-agent'), ...resourceAttrs] },
        scopeSpans: [{ spans }],
      },
    ],
  } as OtlpResourceSpans;
}

describe('mapResourceSpans', () => {
  it('maps a GenAI llm span to step_executed with model and tokens', () => {
    const result = mapResourceSpans(
      resourceSpans(
        [
          span({
            parentSpanId: 'ffffffffffffffff',
            attributes: [
              attr('gen_ai.request.model', 'claude-sonnet-5'),
              attr('gen_ai.usage.input_tokens', 1200),
              attr('gen_ai.usage.output_tokens', 300),
              attr('toqar.task_type', 'reply_to_lead'),
            ],
          }),
        ],
      ),
    );
    expect(result.unmapped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(toqarEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      event: 'step_executed',
      step_type: 'llm_call',
      model: 'claude-sonnet-5',
      tokens_in: 1200,
      tokens_out: 300,
      latency_ms: 2000,
      status: 'ok',
      task_type: 'reply_to_lead',
    });
    expect(event.agent).toMatchObject({ name: 'sdr-agent' });
  });

  it('maps a tool span to step_executed tool_call and a root outcome span to task events', () => {
    const result = mapResourceSpans(
      resourceSpans(
        [
          span({
            spanId: '2122232425262728',
            name: 'crm_lookup',
            parentSpanId: 'ffffffffffffffff',
            attributes: [attr('toqar.tool.name', 'crm_lookup')],
            status: { code: 2 },
          }),
          span({
            spanId: 'ffffffffffffffff',
            name: 'replyToLead',
            attributes: [attr('toqar.outcome', 'completed')],
          }),
        ],
        [attr('toqar.task_type', 'reply_to_lead')],
      ),
    );
    expect(result.unmapped).toHaveLength(0);
    const byEvent = Object.groupBy(result.events, (e) => String(e.event));

    expect(byEvent.step_executed?.[0]).toMatchObject({
      step_type: 'tool_call',
      tool_name: 'crm_lookup',
      status: 'error',
    });
    expect(byEvent.task_started?.[0]).toMatchObject({ task_type: 'reply_to_lead', initiator: 'api' });
    expect(byEvent.task_completed?.[0]).toMatchObject({
      verification: 'self_reported',
      duration_ms: 2000,
    });
    for (const e of result.events) expect(toqarEventSchema.safeParse(e).success).toBe(true);
  });

  it('counts unmappable spans with a reason instead of dropping them', () => {
    const result = mapResourceSpans(
      resourceSpans([span({ parentSpanId: 'ffffffffffffffff', name: 'mystery.operation' })]),
    );
    expect(result.events).toHaveLength(0);
    expect(result.unmapped).toEqual([
      { span: 'mystery.operation', reason: 'no recognized conventions' },
    ]);
  });

  it('produces deterministic event ids so OTLP retries dedupe', () => {
    const payload = resourceSpans(
      [span({ attributes: [attr('gen_ai.request.model', 'm'), attr('toqar.task_type', 't_x')], parentSpanId: 'ffffffffffffffff' })],
    );
    const a = mapResourceSpans(payload).events[0]!.event_id;
    const b = mapResourceSpans(payload).events[0]!.event_id;
    expect(a).toBe(b);
    expect(String(a)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

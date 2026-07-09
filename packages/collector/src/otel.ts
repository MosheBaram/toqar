import { createHash } from 'node:crypto';
import { SCHEMA_VERSION } from '@toqar/registry';

/**
 * OTLP/HTTP JSON → TOQAR event mapping (spec: otel-traces). Versioned
 * convention code: mapping changes alter what events exist, so bump the
 * version and note it in the tracking plan when semantics move.
 *
 * Conventions (documented in the collector README):
 * - GenAI spans (OTel GenAI semconv `gen_ai.*`) → step_executed llm_call
 * - Tool spans (`toqar.tool.name` or `gen_ai.tool.name`) → step_executed tool_call
 * - Root spans with `toqar.outcome` → task_started + task_{completed,failed,abandoned}
 * - task ids: `toqar.task_id` attr ?? traceId; run ids: `toqar.run_id` ?? traceId
 * - task_type: span attr ?? resource attr `toqar.task_type` ?? root span name
 * - agent name: resource `service.name`
 */
export const OTEL_MAPPING_VERSION = '0.1.0';

interface OtlpAttr {
  key: string;
  value?: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean };
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string | number;
  endTimeUnixNano: string | number;
  attributes?: OtlpAttr[];
  status?: { code?: number };
}

export interface OtlpResourceSpans {
  resourceSpans?: {
    resource?: { attributes?: OtlpAttr[] };
    scopeSpans?: { spans?: OtlpSpan[] }[];
  }[];
}

export interface OtelMapResult {
  events: Record<string, unknown>[];
  unmapped: { span: string; reason: string }[];
}

function attrMap(attrs: OtlpAttr[] | undefined): Map<string, string | number> {
  const map = new Map<string, string | number>();
  for (const a of attrs ?? []) {
    const v = a.value ?? {};
    if (v.stringValue !== undefined) map.set(a.key, v.stringValue);
    else if (v.intValue !== undefined) map.set(a.key, Number(v.intValue));
    else if (v.doubleValue !== undefined) map.set(a.key, v.doubleValue);
  }
  return map;
}

/** Deterministic uuid-shaped id from span identity — OTLP retries dedupe. */
function deterministicId(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join('|')).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function nanosToIso(nanos: string | number): string {
  return new Date(Number(BigInt(String(nanos)) / 1_000_000n)).toISOString();
}

function latencyMs(span: OtlpSpan): number {
  return Number((BigInt(String(span.endTimeUnixNano)) - BigInt(String(span.startTimeUnixNano))) / 1_000_000n);
}

const OUTCOME_EVENT: Record<string, string> = {
  completed: 'task_completed',
  failed: 'task_failed',
  abandoned: 'task_abandoned',
};

export function mapResourceSpans(payload: OtlpResourceSpans): OtelMapResult {
  const events: Record<string, unknown>[] = [];
  const unmapped: { span: string; reason: string }[] = [];

  for (const rs of payload.resourceSpans ?? []) {
    const resource = attrMap(rs.resource?.attributes);
    const agentName = String(resource.get('service.name') ?? 'unknown-agent');
    const spans = (rs.scopeSpans ?? []).flatMap((s) => s.spans ?? []);
    const roots = spans.filter((s) => !s.parentSpanId);
    const rootTaskType = roots[0] ? String(attrMap(roots[0].attributes).get('toqar.task_type') ?? roots[0].name) : undefined;

    for (const span of spans) {
      const attrs = attrMap(span.attributes);
      const taskType = String(
        attrs.get('toqar.task_type') ?? resource.get('toqar.task_type') ?? rootTaskType ?? span.name,
      );
      const envelope = {
        schema_version: SCHEMA_VERSION,
        timestamp: nanosToIso(span.endTimeUnixNano),
        task_id: String(attrs.get('toqar.task_id') ?? span.traceId),
        run_id: String(attrs.get('toqar.run_id') ?? span.traceId),
        task_type: taskType,
        agent: { name: agentName },
      };
      const status = span.status?.code === 2 ? 'error' : 'ok';

      const model = attrs.get('gen_ai.request.model') ?? attrs.get('gen_ai.response.model');
      const toolName = attrs.get('toqar.tool.name') ?? attrs.get('gen_ai.tool.name');
      const outcome = attrs.get('toqar.outcome');

      if (model !== undefined || toolName !== undefined) {
        events.push({
          ...envelope,
          event: 'step_executed',
          event_id: deterministicId(span.traceId, span.spanId, 'step_executed'),
          step_id: span.spanId,
          step_index: 0,
          step_type: model !== undefined ? 'llm_call' : 'tool_call',
          ...(model !== undefined ? { model: String(model) } : {}),
          ...(toolName !== undefined ? { tool_name: String(toolName) } : {}),
          ...(attrs.has('gen_ai.usage.input_tokens')
            ? { tokens_in: Number(attrs.get('gen_ai.usage.input_tokens')) }
            : {}),
          ...(attrs.has('gen_ai.usage.output_tokens')
            ? { tokens_out: Number(attrs.get('gen_ai.usage.output_tokens')) }
            : {}),
          latency_ms: latencyMs(span),
          status,
        });
        continue;
      }

      if (!span.parentSpanId && typeof outcome === 'string' && OUTCOME_EVENT[outcome]) {
        events.push({
          ...envelope,
          timestamp: nanosToIso(span.startTimeUnixNano),
          event: 'task_started',
          event_id: deterministicId(span.traceId, span.spanId, 'task_started'),
          initiator: 'api',
        });
        const outcomeEvent = OUTCOME_EVENT[outcome]!;
        events.push({
          ...envelope,
          event: outcomeEvent,
          event_id: deterministicId(span.traceId, span.spanId, outcomeEvent),
          ...(outcomeEvent === 'task_completed'
            ? { verification: 'self_reported', duration_ms: latencyMs(span), steps_total: spans.length }
            : {}),
          ...(outcomeEvent === 'task_failed'
            ? { error: { type: 'task_failed' }, retryable: false, duration_ms: latencyMs(span) }
            : {}),
          ...(outcomeEvent === 'task_abandoned'
            ? { abandoned_by: 'system', duration_ms: latencyMs(span) }
            : {}),
        });
        continue;
      }

      unmapped.push({ span: span.name, reason: 'no recognized conventions' });
    }
  }

  return { events, unmapped };
}

import { SCHEMA_VERSION, toqarEventSchema, type AgentIdentity } from '@toqar/registry';

/**
 * The shipped analytics wrapper (spec: sdk-node): typed emitters over one
 * track() chokepoint, fire-and-forget with batching, kill switch. Delivery
 * can never block or crash the host — failures warn and drop.
 */

export interface TaskContext {
  task_id: string;
  run_id: string;
  task_type: string;
  session_id?: string;
}

export interface ToqarClientOptions {
  /** Collector base URL; events POST to `${endpoint}/v1/events`. */
  endpoint: string;
  token: string;
  agent: AgentIdentity;
  /** Auto-flush interval. Default 2000ms. */
  flushIntervalMs?: number;
  /** Max events per POST. Default 20. */
  maxBatch?: number;
  /** Max buffered events before oldest are dropped (with warning). Default 1000. */
  maxBuffered?: number;
  /** Delivery attempts per batch before dropping. Default 2. */
  maxRetries?: number;
  /** Validate payloads against toqarEventSchema before queueing (dev mode). */
  devValidate?: boolean;
  onWarn?: (message: string) => void;
  fetchImpl?: typeof fetch;
}

type Event = Record<string, unknown>;

export interface ToqarClient {
  analytics: {
    taskStarted: (ctx: TaskContext, p: { initiator: 'human' | 'agent' | 'schedule' | 'api'; parent_task_id?: string; input_ref?: string }) => void;
    taskCompleted: (ctx: TaskContext, p: { verification: 'verified' | 'self_reported'; verifier?: string; duration_ms: number; steps_total: number; tokens_in_total?: number; tokens_out_total?: number; cost_usd?: number; output_ref?: string }) => void;
    taskFailed: (ctx: TaskContext, p: { error: { type: string; message?: string }; retryable: boolean; duration_ms: number; failed_step_id?: string }) => void;
    taskAbandoned: (ctx: TaskContext, p: { abandoned_by: 'human' | 'timeout' | 'system'; reason?: string; duration_ms: number }) => void;
    stepExecuted: (ctx: TaskContext, p: { step_id: string; step_index: number; step_type: 'llm_call' | 'tool_call' | 'retrieval' | 'code_execution' | 'handoff' | 'other'; tool_name?: string; model?: string; tokens_in?: number; tokens_out?: number; latency_ms: number; status: 'ok' | 'error' | 'timeout'; error?: { type: string; message?: string }; retry_of_step_id?: string }) => void;
    handoffToHuman: (ctx: TaskContext, p: { handoff_id: string; reason: 'approval_required' | 'low_confidence' | 'error' | 'policy' | 'clarification' | 'user_request'; blocking: boolean; context_ref?: string }) => void;
    humanApproved: (ctx: TaskContext, p: { handoff_id: string; response_latency_ms: number }) => void;
    humanEdited: (ctx: TaskContext, p: { handoff_id?: string; artifact_type: string; edit_magnitude?: { unit: 'chars' | 'tokens' | 'lines'; value: number } }) => void;
    humanOverrode: (ctx: TaskContext, p: { handoff_id?: string; takeover_step_id?: string; reason?: string }) => void;
    feedbackGiven: (ctx: TaskContext, p: { rating: { kind: 'binary' | 'scale'; value: number }; source: 'end_user' | 'operator'; comment_ref?: string }) => void;
  };
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export function createToqarClient(opts: ToqarClientOptions): ToqarClient {
  const disabled = process.env.TOQAR_ANALYTICS_DISABLED === '1';
  const warn = opts.onWarn ?? ((m: string) => console.warn(`[toqar] ${m}`));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBatch = opts.maxBatch ?? 20;
  const maxBuffered = opts.maxBuffered ?? 1000;
  const maxRetries = opts.maxRetries ?? 2;

  const queue: Event[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing: Promise<void> = Promise.resolve();

  function enqueue(event: string, ctx: TaskContext, props: object): void {
    if (disabled) return;
    const payload: Event = {
      event_id: crypto.randomUUID(),
      schema_version: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      agent: opts.agent,
      ...ctx,
      event,
      ...props,
    };
    if (opts.devValidate) {
      const parsed = toqarEventSchema.safeParse(payload);
      if (!parsed.success) {
        warn(`invalid ${event} dropped (dev validation): ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        return;
      }
    }
    queue.push(payload);
    if (queue.length > maxBuffered) {
      queue.shift();
      warn('buffer full — oldest event dropped');
    }
    if (!timer && !disabled) {
      timer = setInterval(() => void flush(), opts.flushIntervalMs ?? 2000);
      timer.unref?.();
    }
  }

  async function deliver(batch: Event[]): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetchImpl(`${opts.endpoint}/v1/events`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opts.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ events: batch }),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { rejected?: unknown[] };
          if (Array.isArray(body.rejected) && body.rejected.length > 0) {
            warn(`collector rejected ${body.rejected.length} event(s): ${JSON.stringify(body.rejected[0])}`);
          }
          return;
        }
        warn(`collector responded ${res.status} (attempt ${attempt + 1}/${maxRetries + 1})`);
      } catch (err) {
        warn(`delivery error (attempt ${attempt + 1}/${maxRetries + 1}): ${(err as Error).message}`);
      }
    }
    warn(`batch of ${batch.length} dropped after ${maxRetries + 1} attempts`);
  }

  async function flush(): Promise<void> {
    flushing = flushing.then(async () => {
      while (queue.length > 0) {
        const batch = queue.splice(0, maxBatch);
        await deliver(batch);
      }
    });
    return flushing;
  }

  const emit =
    (event: string) =>
    (ctx: TaskContext, props: object): void => {
      try {
        enqueue(event, ctx, props);
      } catch (err) {
        warn(`emit failed for ${event}: ${(err as Error).message}`);
      }
    };

  return {
    analytics: {
      taskStarted: emit('task_started'),
      taskCompleted: emit('task_completed'),
      taskFailed: emit('task_failed'),
      taskAbandoned: emit('task_abandoned'),
      stepExecuted: emit('step_executed'),
      handoffToHuman: emit('handoff_to_human'),
      humanApproved: emit('human_approved'),
      humanEdited: emit('human_edited'),
      humanOverrode: emit('human_overrode'),
      feedbackGiven: emit('feedback_given'),
    },
    flush,
    async shutdown() {
      if (timer) clearInterval(timer);
      timer = null;
      await flush();
    },
  };
}

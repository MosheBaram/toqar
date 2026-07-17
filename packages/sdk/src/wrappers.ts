import type { TaskContext, ToqarClient } from './client.js';

/**
 * Framework auto-instrument wrappers (spec: sdk-node delta): drop-in
 * around the clients an app already has — TOQAR events flow with no
 * manual track() calls, the zero-PR five-minute first-data path. Wrappers
 * inherit the SDK's guarantees (fire-and-forget, never block or crash the
 * host, kill switch) because they emit through the same client. Events
 * land under the same registry contract as agent-planned instrumentation
 * — the two paths never fork.
 */

interface UsageShapes {
  /** Anthropic: usage.input_tokens/output_tokens. OpenAI: usage.prompt_tokens/completion_tokens. Vercel AI: usage.promptTokens/completionTokens. */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  model?: string;
}

function tokensFrom(result: UsageShapes): { tokens_in?: number; tokens_out?: number } {
  const u = result.usage ?? {};
  const tokens_in = u.input_tokens ?? u.prompt_tokens ?? u.promptTokens;
  const tokens_out = u.output_tokens ?? u.completion_tokens ?? u.completionTokens;
  return {
    ...(tokens_in !== undefined ? { tokens_in } : {}),
    ...(tokens_out !== undefined ? { tokens_out } : {}),
  };
}

let stepCounter = 0;
const nextStep = () => `wrapped_${++stepCounter}`;

function emitLlmStep(
  toqar: ToqarClient,
  ctx: TaskContext,
  args: { model?: string | undefined; latency_ms: number; ok: boolean; result?: UsageShapes | undefined; errorType?: string | undefined },
): void {
  toqar.analytics.stepExecuted(ctx, {
    step_id: nextStep(),
    step_index: stepCounter,
    step_type: 'llm_call',
    ...(args.model ? { model: args.model } : {}),
    ...(args.result ? tokensFrom(args.result) : {}),
    latency_ms: args.latency_ms,
    status: args.ok ? 'ok' : 'error',
    ...(args.errorType ? { error: { type: args.errorType } } : {}),
  });
}

/** Shared method wrapper: measure, emit, and NEVER alter the call's behavior. */
function wrapCall<A extends unknown[], R extends UsageShapes>(
  fn: (...args: A) => Promise<R>,
  toqar: ToqarClient,
  ctx: TaskContext,
  modelOf: (args: A, result?: R) => string | undefined,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const started = Date.now();
    try {
      const result = await fn(...args);
      emitLlmStep(toqar, ctx, {
        model: modelOf(args, result),
        latency_ms: Date.now() - started,
        ok: true,
        result,
      });
      return result;
    } catch (err) {
      emitLlmStep(toqar, ctx, {
        model: modelOf(args),
        latency_ms: Date.now() - started,
        ok: false,
        errorType: err instanceof Error ? err.name : 'error',
      });
      throw err;
    }
  };
}

interface AnthropicLike {
  messages: { create: (args: { model?: string }) => Promise<UsageShapes> };
}

/** `wrapAnthropic(client, toqar, ctx)` — every messages.create emits a step. */
export function wrapAnthropic<T extends AnthropicLike>(client: T, toqar: ToqarClient, ctx: TaskContext): T {
  const original = client.messages.create.bind(client.messages);
  client.messages.create = wrapCall(original, toqar, ctx, (args, result) => result?.model ?? args[0]?.model);
  return client;
}

interface OpenAILike {
  chat: { completions: { create: (args: { model?: string }) => Promise<UsageShapes> } };
}

/** `wrapOpenAI(client, toqar, ctx)` — every chat.completions.create emits a step. */
export function wrapOpenAI<T extends OpenAILike>(client: T, toqar: ToqarClient, ctx: TaskContext): T {
  const original = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = wrapCall(original, toqar, ctx, (args, result) => result?.model ?? args[0]?.model);
  return client;
}

/** Vercel AI SDK: wrap `generateText`-shaped functions. */
export function wrapVercelAI<A extends { model?: unknown }, R extends UsageShapes>(
  generate: (args: A) => Promise<R>,
  toqar: ToqarClient,
  ctx: TaskContext,
): (args: A) => Promise<R> {
  return wrapCall(generate as (...a: [A]) => Promise<R>, toqar, ctx, (args, result) =>
    result?.model ?? (typeof args[0]?.model === 'string' ? args[0].model : undefined),
  );
}

/**
 * LangChain/LangGraph: a callbacks handler — pass in `callbacks: [handler]`.
 * Emits a step per LLM run end/error with the reported token usage.
 */
export function toqarLangChainCallbacks(toqar: ToqarClient, ctx: TaskContext): {
  handleLLMStart: (llm: { name?: string }, prompts: string[], runId: string) => void;
  handleLLMEnd: (output: { llmOutput?: { tokenUsage?: { promptTokens?: number; completionTokens?: number } } }, runId: string) => void;
  handleLLMError: (err: Error, runId: string) => void;
} {
  const starts = new Map<string, { at: number; model?: string }>();
  return {
    handleLLMStart(llm, _prompts, runId) {
      starts.set(runId, { at: Date.now(), ...(llm.name ? { model: llm.name } : {}) });
    },
    handleLLMEnd(output, runId) {
      const start = starts.get(runId);
      starts.delete(runId);
      const usage = output.llmOutput?.tokenUsage ?? {};
      emitLlmStep(toqar, ctx, {
        model: start?.model,
        latency_ms: start ? Date.now() - start.at : 0,
        ok: true,
        result: {
          usage: {
            ...(usage.promptTokens !== undefined ? { promptTokens: usage.promptTokens } : {}),
            ...(usage.completionTokens !== undefined ? { completionTokens: usage.completionTokens } : {}),
          },
        },
      });
    },
    handleLLMError(err, runId) {
      const start = starts.get(runId);
      starts.delete(runId);
      emitLlmStep(toqar, ctx, {
        model: start?.model,
        latency_ms: start ? Date.now() - start.at : 0,
        ok: false,
        errorType: err.name,
      });
    },
  };
}

import { describe, expect, it } from 'vitest';
import { createToqarClient } from './client.js';
import { toqarLangChainCallbacks, wrapAnthropic, wrapOpenAI, wrapVercelAI } from './wrappers.js';

const ctx = { task_id: 'task_1', run_id: 'run_1', task_type: 'reply_to_lead' };

function harness() {
  const sent: Record<string, unknown>[] = [];
  const toqar = createToqarClient({
    endpoint: 'http://collector.test',
    token: 'tok_x',
    agent: { name: 'wrapped-app', version: '1.0.0' },
    flushIntervalMs: 60_000,
    fetchImpl: (async (_url: string, init: { body: string }) => {
      sent.push(...(JSON.parse(init.body).events as Record<string, unknown>[]));
      return { ok: true, status: 202 } as Response;
    }) as unknown as typeof fetch,
  });
  return { toqar, sent, flush: () => toqar.flush() };
}

describe('framework wrappers (spec: sdk-node delta)', () => {
  it('wrapAnthropic emits a step per messages.create with tokens and model', async () => {
    const { toqar, sent, flush } = harness();
    const client = wrapAnthropic(
      {
        messages: {
          create: async () => ({ model: 'claude-opus-4-8', usage: { input_tokens: 400, output_tokens: 90 } }),
        },
      },
      toqar,
      ctx,
    );
    const result = await client.messages.create({ model: 'claude-opus-4-8' });
    expect(result.usage?.input_tokens).toBe(400); // behavior unaltered
    await flush();
    expect(sent[0]).toMatchObject({
      event: 'step_executed',
      step_type: 'llm_call',
      model: 'claude-opus-4-8',
      tokens_in: 400,
      tokens_out: 90,
      status: 'ok',
    });
  });

  it('wrapOpenAI maps prompt/completion token names and errors never crash the host', async () => {
    const { toqar, sent, flush } = harness();
    const failing = wrapOpenAI(
      { chat: { completions: { create: async () => { throw new TypeError('boom'); } } } },
      toqar,
      ctx,
    );
    await expect(failing.chat.completions.create({ model: 'gpt-x' })).rejects.toThrow('boom');
    const ok = wrapOpenAI(
      { chat: { completions: { create: async () => ({ model: 'gpt-x', usage: { prompt_tokens: 10, completion_tokens: 5 } }) } } },
      toqar,
      ctx,
    );
    await ok.chat.completions.create({ model: 'gpt-x' });
    await flush();
    expect(sent[0]).toMatchObject({ status: 'error', error: { type: 'TypeError' }, model: 'gpt-x' });
    expect(sent[1]).toMatchObject({ status: 'ok', tokens_in: 10, tokens_out: 5 });
  });

  it('wrapVercelAI wraps generateText-shaped functions', async () => {
    const { toqar, sent, flush } = harness();
    const generate = wrapVercelAI(
      async (_args: { model?: unknown }) => ({ usage: { promptTokens: 7, completionTokens: 3 } }),
      toqar,
      ctx,
    );
    await generate({ model: 'vercel-model' });
    await flush();
    expect(sent[0]).toMatchObject({ tokens_in: 7, tokens_out: 3, model: 'vercel-model' });
  });

  it('LangChain callbacks emit per run with usage, pairing start and end', async () => {
    const { toqar, sent, flush } = harness();
    const handler = toqarLangChainCallbacks(toqar, ctx);
    handler.handleLLMStart({ name: 'claude-opus-4-8' }, ['prompt'], 'run-a');
    handler.handleLLMEnd({ llmOutput: { tokenUsage: { promptTokens: 12, completionTokens: 6 } } }, 'run-a');
    handler.handleLLMStart({ name: 'claude-opus-4-8' }, ['prompt'], 'run-b');
    handler.handleLLMError(new RangeError('bad'), 'run-b');
    await flush();
    expect(sent[0]).toMatchObject({ status: 'ok', tokens_in: 12, tokens_out: 6 });
    expect(sent[1]).toMatchObject({ status: 'error', error: { type: 'RangeError' } });
  });
});

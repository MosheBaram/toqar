import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin model seam: the runner needs one prompt→text exchange with usage
 * accounting. Tests script this; production binds the Anthropic API.
 * (The full Agent SDK harness arrives with the GitHub App packaging —
 * recorded as a deviation in tasks.md.)
 */
export interface ModelSession {
  model: string;
  send(prompt: string): Promise<{
    text: string;
    usage: { input_tokens: number; output_tokens: number };
  }>;
}

export interface CostRates {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

export function createAnthropicSession(model: string, client = new Anthropic()): ModelSession {
  return {
    model,
    async send(prompt) {
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = response.content[0];
      return {
        text: block && block.type === 'text' ? block.text : '',
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    },
  };
}

export function computeCostUsd(
  usage: { input_tokens: number; output_tokens: number },
  rates: CostRates,
): number {
  return (
    (usage.input_tokens / 1_000_000) * rates.inputPerMTok +
    (usage.output_tokens / 1_000_000) * rates.outputPerMTok
  );
}

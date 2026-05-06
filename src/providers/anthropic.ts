import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { buildPrompt, parseResponse } from './shared.js';
import type { ProviderResult } from '../types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export async function callAnthropic(
  modelId: string,
  question: string,
  options: string[]
): Promise<ProviderResult> {
  const prompt = buildPrompt(question, options);
  const response = await getClient().messages.create({
    model: modelId,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content[0];
  const content = block.type === 'text' ? block.text : '';
  return parseResponse(content, options, modelId);
}

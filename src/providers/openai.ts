import OpenAI from 'openai';
import { config } from '../config.js';
import { buildPrompt, parseResponse } from './shared.js';
import type { ProviderResult } from '../types.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export async function callOpenAI(
  modelId: string,
  question: string,
  options: string[]
): Promise<ProviderResult> {
  const prompt = buildPrompt(question, options);
  const response = await getClient().chat.completions.create({
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 512,
    response_format: { type: 'json_object' },
  });
  const content = response.choices[0]?.message?.content ?? '';
  return parseResponse(content, options, modelId);
}

import { Ollama } from 'ollama';
import { config } from '../config.js';
import { buildPrompt, parseResponse } from './shared.js';
import type { ProviderResult } from '../types.js';

let client: Ollama | null = null;

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({ host: config.ollamaBaseUrl });
  }
  return client;
}

export async function callOllama(
  modelId: string,
  question: string,
  options: string[]
): Promise<ProviderResult> {
  const prompt = buildPrompt(question, options);
  const response = await getClient().chat({
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    format: 'json',
    options: { temperature: 0.7, num_predict: 512 },
  });
  const content = response.message.content;
  return parseResponse(content, options, modelId);
}

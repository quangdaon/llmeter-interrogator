import { callOpenAI } from './openai.js';
import { callAnthropic } from './anthropic.js';
import { callGoogle } from './google.js';
import { callOllama } from './ollama.js';
import type { ProviderResult } from '../types.js';

export async function callProvider(
  provider: string,
  modelId: string,
  question: string,
  options: string[]
): Promise<ProviderResult> {
  switch (provider.toLowerCase()) {
    case 'openai':
      return callOpenAI(modelId, question, options);
    case 'anthropic':
      return callAnthropic(modelId, question, options);
    case 'gemini':
      return callGoogle(modelId, question, options);
    case 'ollama':
      return callOllama(modelId, question, options);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

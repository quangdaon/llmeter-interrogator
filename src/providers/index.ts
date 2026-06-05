import { callOpenAI } from './openai.js';
import { callAnthropic } from './anthropic.js';
import { callGoogle } from './google.js';
import { callOllama } from './ollama.js';
import type { ProviderResult } from '../types.js';

export async function callProvider(
  provider: string,
  modelId: string,
  question: string,
  options: string[],
  additionalInstructions?: string
): Promise<ProviderResult> {
  switch (provider.toLowerCase()) {
    case 'openai':
      return callOpenAI(modelId, question, options, additionalInstructions);
    case 'anthropic':
      return callAnthropic(modelId, question, options, additionalInstructions);
    case 'gemini':
      return callGoogle(modelId, question, options, additionalInstructions);
    case 'ollama':
      return callOllama(modelId, question, options, additionalInstructions);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

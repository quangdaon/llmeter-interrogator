import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { buildPrompt, parseResponse } from './shared.js';
import { logger } from '../logger.js';
import type { ProviderResult } from '../types.js';

let genAI: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: config.googleApiKey });
  }
  return genAI;
}

function isTransient(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes('503') ||
    msg.includes('Service Unavailable') ||
    msg.includes('529') ||
    msg.includes('500') ||
    msg.includes('Internal Server Error')
  );
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    selection: { type: 'string' },
    reasoning: { type: 'string' },
  },
  required: ['selection', 'reasoning'],
};

export async function callGoogle(
  modelId: string,
  question: string,
  options: string[],
  additionalInstructions?: string
): Promise<ProviderResult> {
  const prompt = buildPrompt(question, options, additionalInstructions);
  const client = getClient();
  const maxAttempts = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await client.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction:
            'Be extremely concise. Your reasoning field must be one short sentence — 20 words maximum. Never elaborate.',
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA as never,
          temperature: 0.7,
          maxOutputTokens: 2048,
          thinkingConfig: {
            // Small fixed budget: dynamic thinking is the default but can
            // produce empty content with finishReason STOP on gemini-2.5-pro.
            // A low explicit budget is the recommended mitigation.
            thinkingBudget: 1024,
          },
        },
      });
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === maxAttempts) throw err;
      const delay = 2000 * Math.pow(2, attempt - 1);
      logger.warn(
        `${modelId}: transient error on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms — ${String(err)}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason ?? 'UNKNOWN';

    if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      throw new Error(`${modelId}: Response blocked (finishReason: ${finishReason})`);
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new Error(`${modelId}: Response truncated — increase maxOutputTokens`);
    }

    const content = response.text ?? '';
    if (!content.trim()) {
      lastErr = new Error(
        `${modelId}: Empty response on attempt ${attempt}/${maxAttempts} (finishReason: ${finishReason}, candidates: ${response.candidates?.length ?? 0})`
      );
      logger.warn(String(lastErr));
      if (attempt < maxAttempts) {
        const delay = 1000 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      continue;
    }

    return parseResponse(content, options, modelId);
  }

  throw lastErr ?? new Error(`${modelId}: Failed after ${maxAttempts} attempts`);
}

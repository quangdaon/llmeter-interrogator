import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { buildPrompt, parseResponse } from './shared.js';
import type { ProviderResult } from '../types.js';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.googleApiKey);
  }
  return genAI;
}

function isTransient(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('529');
}

// Retries on transient HTTP errors AND on empty content (known gemini-2.5-pro bug).
async function withRetry<T>(
  fn: () => Promise<T>,
  isEmpty: (result: T) => boolean,
  maxAttempts = 4
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)));
      continue;
    }
    if (!isEmpty(result)) return result;
    lastErr = new Error('Empty response (known gemini-2.5-pro intermittent issue)');
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastErr;
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
  options: string[]
): Promise<ProviderResult> {
  const prompt = buildPrompt(question, options);
  const model = getClient().getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA as never,
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  const result = await withRetry(
    () => model.generateContent(prompt),
    (r) => {
      const candidate = r.response.candidates?.[0];
      if (!candidate) return true;
      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') return false;
      return !r.response.text().trim();
    }
  );

  const candidate = result.response.candidates?.[0];
  if (!candidate) {
    throw new Error(`${modelId}: No candidates in response`);
  }
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
    throw new Error(`${modelId}: Response blocked (finishReason: ${candidate.finishReason})`);
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error(`${modelId}: Response truncated — increase maxOutputTokens`);
  }

  const content = result.response.text();
  if (!content.trim()) {
    throw new Error(`${modelId}: Empty response after retries (finishReason: ${candidate.finishReason})`);
  }

  return parseResponse(content, options, modelId);
}

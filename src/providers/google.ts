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

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === maxAttempts) throw err;
      const delayMs = 2000 * Math.pow(2, attempt - 1); // 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

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
      temperature: 0.7,
      maxOutputTokens: 512,
    },
  });

  const result = await withRetry(() => model.generateContent(prompt));

  const candidate = result.response.candidates?.[0];
  if (!candidate || candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
    throw new Error(`${modelId}: Response blocked (finishReason: ${candidate?.finishReason ?? 'no candidates'})`);
  }

  const content = result.response.text();
  if (!content.trim()) {
    throw new Error(`${modelId}: Empty response from model`);
  }

  return parseResponse(content, options, modelId);
}

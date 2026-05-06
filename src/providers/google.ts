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
  const result = await model.generateContent(prompt);
  const content = result.response.text();
  return parseResponse(content, options, modelId);
}

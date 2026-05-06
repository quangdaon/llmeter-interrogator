import type { ProviderResult } from '../types.js';

export function buildPrompt(question: string, options: string[]): string {
  const optionsList = options
    .map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`)
    .join('\n');

  return `You are an AI assistant participating in a fun personality quiz. Your task is to answer a multiple-choice question by selecting exactly one of the provided options.

IMPORTANT: You MUST select one of the exact options listed. Do not refuse, hedge, or provide alternative answers. The quiz is designed to explore what choices AI models would make if they had preferences.

Question: ${question}

Options:
${optionsList}

Respond with ONLY a JSON object in this exact format:
{
  "selection": "<exact text of your chosen option>",
  "reasoning": "<1-2 sentences explaining your choice>"
}

The "selection" value must exactly match one of the option texts above. No other text before or after the JSON.`;
}

function findClosestOption(text: string, options: string[]): string | null {
  const lower = text.toLowerCase().trim();
  // Exact match first
  for (const opt of options) {
    if (opt.toLowerCase() === lower) return opt;
  }
  // Substring match
  for (const opt of options) {
    if (lower.includes(opt.toLowerCase()) || opt.toLowerCase().includes(lower)) {
      return opt;
    }
  }
  // Letter match (A, B, C...)
  const letterMatch = lower.match(/^[a-g][):.]/);
  if (letterMatch) {
    const idx = letterMatch[0].charCodeAt(0) - 97;
    if (idx >= 0 && idx < options.length) return options[idx];
  }
  return null;
}

export function parseResponse(
  raw: string,
  options: string[],
  modelId: string
): ProviderResult {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();

  let parsed: { selection?: string; reasoning?: string } = {};

  // Try direct JSON parse
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        // Continue to fuzzy fallback
      }
    }
  }

  const selection = parsed.selection
    ? findClosestOption(parsed.selection, options) ?? parsed.selection
    : null;

  const reasoning = parsed.reasoning ?? '';

  if (!selection) {
    throw new Error(
      `${modelId}: Could not parse a valid selection from response: ${raw.slice(0, 200)}`
    );
  }

  const validOption = options.find((o) => o === selection);
  if (!validOption) {
    // Try fuzzy match on the parsed selection
    const fuzzy = findClosestOption(selection, options);
    if (!fuzzy) {
      throw new Error(
        `${modelId}: Selection "${selection}" does not match any option in [${options.join(', ')}]`
      );
    }
    return { modelId, selection: fuzzy, reasoning };
  }

  return { modelId, selection: validOption, reasoning };
}

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import slugify from 'slugify';
import { config } from './config.js';
import type {
  YamlProvider,
  YamlQuestion,
  DataSet,
  Model,
  Question,
} from './types.js';

const OUTPUT_FILE = path.join(config.webappDataPath, 'questions.json');
const MODELS_YAML = path.join(config.dataPath, 'models.yml');
const QUESTIONS_YAML = path.join(config.dataPath, 'questions.yml');

function makeId(text: string): string {
  return slugify(text, { lower: true, strict: true });
}

export function loadYamlModels(): YamlProvider[] {
  const raw = fs.readFileSync(MODELS_YAML, 'utf-8');
  return yaml.load(raw) as YamlProvider[];
}

export function saveYamlModels(providers: YamlProvider[]): void {
  const out = yaml.dump(providers, { lineWidth: -1 });
  fs.writeFileSync(MODELS_YAML, out, 'utf-8');
}

export function loadYamlQuestions(): YamlQuestion[] {
  const raw = fs.readFileSync(QUESTIONS_YAML, 'utf-8');
  return yaml.load(raw) as YamlQuestion[];
}

export function loadDataSet(): DataSet {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return {
      generatedAt: new Date().toISOString(),
      models: [],
      questions: [],
    };
  }
  const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
  return JSON.parse(raw) as DataSet;
}

export function saveDataSet(data: DataSet): void {
  fs.mkdirSync(config.webappDataPath, { recursive: true });
  data.generatedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function buildModels(providers: YamlProvider[]): Model[] {
  const models: Model[] = [];
  for (const provider of providers) {
    for (const m of provider.models) {
      models.push({
        id: m.id,
        name: m.name,
        provider: provider.provider,
        logo: m.logo ?? '/images/models/placeholder.png',
        color: m.color ?? '#888888',
      });
    }
  }
  return models;
}

export function buildQuestions(
  yamlQuestions: YamlQuestion[],
  existing: DataSet
): Question[] {
  return yamlQuestions.map((yq) => {
    const id = makeId(yq.question);
    const found = existing.questions.find((q) => q.id === id);
    return found ?? { id, text: yq.question, options: yq.options, responses: [] };
  });
}

export function findGaps(
  questions: Question[],
  models: Model[],
  yamlQuestions: YamlQuestion[] = []
): Array<{ question: Question; modelId: string; provider: string; additionalInstructions?: string }> {
  const gaps: Array<{ question: Question; modelId: string; provider: string; additionalInstructions?: string }> =
    [];
  const instructionsMap = new Map(
    yamlQuestions.map((yq) => [makeId(yq.question), yq.additionalInstructions])
  );

  // Priority ordering per spec: get one response per provider per question before
  // circling back. Build a map: provider → models in order.
  const modelsByProvider = new Map<string, Model[]>();
  for (const m of models) {
    const arr = modelsByProvider.get(m.provider) ?? [];
    arr.push(m);
    modelsByProvider.set(m.provider, arr);
  }

  // For each provider, interleave: first model of each question, then second, etc.
  const maxModels = Math.max(...Array.from(modelsByProvider.values()).map((ms) => ms.length));

  for (let modelIndex = 0; modelIndex < maxModels; modelIndex++) {
    for (const [, providerModels] of modelsByProvider) {
      if (modelIndex >= providerModels.length) continue;
      const model = providerModels[modelIndex];

      for (const question of questions) {
        const hasResponse = question.responses.some((r) => r.modelId === model.id);
        if (!hasResponse) {
          gaps.push({
            question,
            modelId: model.id,
            provider: model.provider,
            additionalInstructions: instructionsMap.get(question.id),
          });
        }
      }
    }
  }

  return gaps;
}

export interface YamlModel {
  id: string;
  name: string;
  logo?: string;
  color?: string;
}

export interface YamlProvider {
  provider: string;
  color?: string;
  models: YamlModel[];
}

export interface YamlQuestion {
  question: string;
  options: string[];
}

export interface ModelResponse {
  modelId: string;
  selection: string;
  reasoning: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  responses: ModelResponse[];
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  logo: string;
  color: string;
}

export interface DataSet {
  generatedAt: string;
  models: Model[];
  questions: Question[];
}

export interface EvaluationTask {
  question: Question;
  modelId: string;
  provider: string;
}

export interface ProviderResult {
  modelId: string;
  selection: string;
  reasoning: string;
}

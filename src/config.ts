import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  webappDataPath: path.resolve(
    projectRoot,
    process.env.WEBAPP_DATA_PATH || '../llmeter/src/lib/server'
  ),
  webappImagesPath: path.resolve(
    projectRoot,
    process.env.WEBAPP_IMAGES_PATH || '../llmeter/static/images/models'
  ),
  logsPath: path.resolve(projectRoot, 'logs'),
  dataPath: path.resolve(projectRoot, 'data'),
};

export function isProviderEnabled(provider: string): boolean {
  switch (provider.toLowerCase()) {
    case 'openai':
      return !!config.openaiApiKey;
    case 'anthropic':
      return !!config.anthropicApiKey;
    case 'gemini':
      return !!config.googleApiKey;
    case 'ollama':
      return true; // Always try Ollama; individual model calls may fail
    default:
      return false;
  }
}

import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import type { YamlProvider } from './types.js';

// Map of model ID prefixes / exact IDs to logo info
const MODEL_LOGO_MAP: Record<string, { logoId: string; color: string }> = {
  // OpenAI GPT models
  'gpt-': { logoId: 'openai', color: '#10A37F' },
  // Anthropic Claude models
  'claude-': { logoId: 'anthropic', color: '#D97757' },
  // Google Gemini models (via Gemini provider)
  'gemini-': { logoId: 'google', color: '#4285F4' },
  // Google Gemma models (via Ollama)
  'gemma': { logoId: 'google', color: '#4285F4' },
  // Meta Llama models (via Ollama)
  'llama': { logoId: 'meta', color: '#0082FB' },
  // Mistral models (via Ollama)
  'mistral': { logoId: 'mistral', color: '#FF7000' },
};

const LOGO_PLACEHOLDER_URLS: Record<string, string> = {
  openai: 'https://placehold.co/128x128/10A37F/FFFFFF.png?text=OpenAI',
  anthropic: 'https://placehold.co/128x128/D97757/FFFFFF.png?text=Claude',
  google: 'https://placehold.co/128x128/1A73E8/FFFFFF.png?text=Google',
  meta: 'https://placehold.co/128x128/0082FB/FFFFFF.png?text=Meta',
  mistral: 'https://placehold.co/128x128/FF7000/FFFFFF.png?text=Mistral',
  placeholder: 'https://placehold.co/128x128/888888/FFFFFF.png?text=AI',
};

// Candidate extensions to check when looking for an existing logo
const LOGO_EXTENSIONS = ['.svg', '.png', '.jpg', '.webp'];

export function getModelLogoInfo(modelId: string): { logoId: string; color: string } {
  for (const [prefix, info] of Object.entries(MODEL_LOGO_MAP)) {
    if (modelId.startsWith(prefix) || modelId === prefix.replace('-', '')) {
      return info;
    }
  }
  return { logoId: 'placeholder', color: '#888888' };
}

async function downloadLogo(url: string, destPath: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}

export async function ensureLogos(providers: YamlProvider[]): Promise<void> {
  fs.mkdirSync(config.webappImagesPath, { recursive: true });

  const needed = new Set<string>();
  for (const provider of providers) {
    for (const model of provider.models) {
      const { logoId } = getModelLogoInfo(model.id);
      needed.add(logoId);
    }
  }

  const downloadPromises = Array.from(needed).map(async (logoId) => {
    // Check if any version of the logo already exists (svg, png, etc.)
    const alreadyExists = LOGO_EXTENSIONS.some((ext) =>
      fs.existsSync(path.join(config.webappImagesPath, `${logoId}${ext}`))
    );
    if (alreadyExists) {
      console.log(`  Logo already exists: ${logoId}.*`);
      return;
    }

    const filename = `${logoId}.png`;
    const destPath = path.join(config.webappImagesPath, filename);
    const url = LOGO_PLACEHOLDER_URLS[logoId] ?? LOGO_PLACEHOLDER_URLS.placeholder;
    console.log(`  Downloading logo: ${filename} from ${url}`);
    const ok = await downloadLogo(url, destPath);
    if (ok) {
      console.log(`  ✓ Saved ${filename}`);
    } else {
      console.warn(`  ✗ Failed to download ${filename}`);
    }
  });

  await Promise.all(downloadPromises);
}

export function applyLogosToProviders(providers: YamlProvider[]): YamlProvider[] {
  return providers.map((provider) => ({
    ...provider,
    models: provider.models.map((model) => {
      const { logoId, color } = getModelLogoInfo(model.id);
      // Prefer SVG if it exists in the webapp images path, else fall back to png
      const svgPath = path.join(config.webappImagesPath, `${logoId}.svg`);
      const ext = fs.existsSync(svgPath) ? 'svg' : 'png';
      return {
        ...model,
        logo: model.logo ?? `/images/models/${logoId}.${ext}`,
        color: model.color ?? color,
      };
    }),
  }));
}

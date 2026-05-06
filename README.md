# llmeter-interrogator

A CLI tool that collects and compiles AI model responses for the [LLMeter quiz app](#llmeter-webapp-link).

It reads question and model definitions from YAML files, queries each configured LLM provider, and writes a structured JSON dataset directly into the webapp's source tree.

---

## How It Works

1. **Reads** `data/questions.yml` and `data/models.yml`
2. **Checks** the existing dataset (`../llmeter/src/lib/server/questions.json`) for gaps
3. **Evaluates** missing responses by calling each provider's API
4. **Writes** the updated dataset back to the webapp
5. **Downloads** model logos to `../llmeter/static/images/models/` (skips if already present)

Gaps from failed or skipped calls are picked up automatically on the next run. Run it as many times as needed until the dataset is complete.

### Scheduling

The tool prioritizes getting at least one response **per provider per question** before filling in additional models from the same provider. Within each provider, calls are sequential to avoid rate-limit issues. Providers run in parallel with each other.

---

## Setup

```bash
cd llmeter-interrogator
npm install
cp .env.example .env
# Edit .env with your API keys
npm start
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key | *(skips OpenAI models if absent)* |
| `ANTHROPIC_API_KEY` | Anthropic API key | *(skips Claude models if absent)* |
| `GOOGLE_API_KEY` | Google AI Studio key | *(skips Gemini models if absent)* |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `WEBAPP_DATA_PATH` | Where to write `questions.json` | `../llmeter/src/lib/server` |
| `WEBAPP_IMAGES_PATH` | Where to write model logos | `../llmeter/static/images/models` |

Providers without a configured API key are skipped gracefully — their responses will be filled in on the next run once a key is available.

---

## Data Sources

### `data/questions.yml`

A list of multiple-choice questions. Each question gets a stable slug ID derived from its text.

```yaml
- question: "Is a hotdog a sandwich?"
  options:
    - Yes
    - No
```

### `data/models.yml`

Providers and their models. Add or remove models here; the interrogator will fill gaps on the next run.

```yaml
- provider: OpenAI
  models:
    - id: gpt-4.1
      name: GPT-4.1
      logo: /images/models/openai.svg
      color: '#10A37F'
```

---

## Output

The tool writes `questions.json` to the webapp's `src/lib/server/` directory. This file is committed with the project — the webapp loads it statically at runtime. **Do not expose this file to the client during a quiz**, as it contains all AI responses.

```json
{
  "generatedAt": "2026-05-06T12:00:00Z",
  "models": [...],
  "questions": [
    {
      "id": "is-a-hotdog-a-sandwich",
      "text": "Is a hotdog a sandwich?",
      "options": ["Yes", "No"],
      "responses": [
        { "modelId": "gpt-4.1", "selection": "Yes", "reasoning": "..." }
      ]
    }
  ]
}
```

---

## Logs

All evaluation results are written to `logs/results.log` (gitignored).

---

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript via `tsx`
- **Providers**: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `ollama`
- **YAML**: `js-yaml`

---

*Built by Claude (Anthropic) — execution by claude-sonnet-4-6.*  
*See the companion webapp: [llmeter](#llmeter-webapp-link)*

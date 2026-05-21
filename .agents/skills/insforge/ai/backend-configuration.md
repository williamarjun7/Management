# AI Backend Configuration

InsForge's AI feature is now the Model Gateway backed by OpenRouter. New app
code should call OpenRouter directly with the OpenAI SDK and an
`OPENROUTER_API_KEY` set up by `npx @insforge/cli ai setup`.

The old `ai.configs` / `ai.usage` database tables and AI Settings model
configuration flow are deprecated. Do not query them for new implementations.

## Setup

Run the CLI setup from the linked app directory first:

```bash
npx @insforge/cli ai setup
```

This fetches the active OpenRouter key from the linked InsForge backend and writes it to `.env.local` as:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

For non-standard projects, use `--env-file <path>` to choose a different env file. If the command is unavailable, ask the user to upgrade `@insforge/cli` or copy the key from the dashboard manually.

For framework-specific placement:

| App type | Where to put it |
|----------|-----------------|
| Next.js | `.env.local` as `OPENROUTER_API_KEY` and use it only in server routes/actions |
| Vite/React SPA | Backend/API server env, not `VITE_*` |
| Node service/script | `.env` or deployment secret as `OPENROUTER_API_KEY` |
| Edge function | Function secret/environment variable |

Never expose the key in browser-visible env vars.

## Model Discovery

Use OpenRouter rather than project-local AI config tables:

```bash
# All OpenRouter models
curl https://openrouter.ai/api/v1/models

# Image output models
curl "https://openrouter.ai/api/v1/models?output_modalities=image"

# Embedding models
curl https://openrouter.ai/api/v1/embeddings/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"

# Video models
curl https://openrouter.ai/api/v1/videos/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

The Dashboard Model Gateway model list is also suitable for browsing model IDs,
modalities, release dates, and pricing.

## OpenAI SDK Configuration

```javascript
import OpenAI from 'openai'

export const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})
```

## Usage Examples

Use the configured `openai` client only from server-side code:

```javascript
const completion = await openai.chat.completions.create({
  model: 'openai/gpt-5.5',
  messages: [{ role: 'user', content: 'Summarize this project.' }],
})

console.log(completion.choices[0]?.message?.content)
```

## Best Practices

1. Keep `OPENROUTER_API_KEY` server-side only.
2. Restart the dev server after adding or changing the env var.
3. Prefer OpenRouter over the deprecated `insforge.ai` endpoints for new work.
4. Do not add project model configs or query `ai.configs` for new implementations.

## When the Key Is Missing

If `OPENROUTER_API_KEY` is missing:

1. Stop before implementing AI calls that would fail.
2. Run `npx @insforge/cli ai setup` from the linked app directory.
3. If the command is unavailable, ask the user to upgrade `@insforge/cli` or copy the key manually from the dashboard.
4. Restart the dev server so the env var is loaded.

## Deprecated Backend Proxy

The old InsForge backend chat completion and image generation endpoints are
still supported for compatibility, but they are deprecated. Use them only when
maintaining existing code that already depends on `insforge.ai`.

For new work, do not add project model configuration, do not query `ai.configs`,
and do not depend on the old AI Settings flow.

## Common Mistakes

| Mistake | Solution |
|---------|----------|
| Asking the user to configure models in AI Settings | Run `npx @insforge/cli ai setup` before adding OpenRouter code |
| Querying `ai.configs` or `ai.usage` | Use OpenRouter model APIs and activity APIs |
| Putting the key in public frontend env vars | Keep `OPENROUTER_API_KEY` server-side |
| Using the deprecated InsForge SDK AI module for new code | Use OpenRouter with the OpenAI SDK |

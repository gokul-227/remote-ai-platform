# Remote AI Platform AI Providers

All application AI calls go through LiteLLM. The application does not import provider SDKs.

## Groq development

Create a Groq API key, then set these values in the local `.env` file:

```dotenv
AI_PROVIDER=groq
AI_MODEL=llama-3.1-8b-instant
AI_API_KEY=your_groq_key
AI_FALLBACK_PROVIDERS=ollama/qwen2.5
```

Start the stack with `docker compose -f infra/docker/docker-compose.yml up -d --build`.

## Ollama local fallback

Run Ollama on the host and pull a model:

```bash
ollama pull qwen2.5
```

Then use:

```dotenv
AI_PROVIDER=ollama
AI_MODEL=qwen2.5
OLLAMA_BASE_URL=http://host.docker.internal:11434
AI_FALLBACK_PROVIDERS=
```

`AI_API_KEY` is not required for Ollama. `LITELLM_BASE_URL` can point to an OpenAI-compatible gateway when `AI_PROVIDER` is set to `openai` or another supported provider name.

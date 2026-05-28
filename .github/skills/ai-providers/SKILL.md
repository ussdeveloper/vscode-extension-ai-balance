---
name: ai-providers
description: 'Knowledge about AI model providers, their API endpoints, authentication methods, supported models, and pricing. Use when: adding a new provider to ai-balance, researching API compatibility, understanding model naming conventions, or configuring provider connections. NOT for general coding questions.'
user-invocable: true
---

# AI Providers Knowledge

Comprehensive reference about AI model providers, their APIs, and how to connect to them. Based on patterns from opencode and other open-source AI tools.

## When to Use
- Adding a new provider to ai-balance extension
- Researching API endpoints and auth methods
- Understanding model naming conventions
- Debugging provider connection issues
- Comparing pricing and rate limits

## Provider Reference

See [./references/providers.md](./references/providers.md) for detailed provider specifications.
See [./references/models.md](./references/models.md) for model listings per provider.
See [./references/api-patterns.md](./references/api-patterns.md) for common API patterns.

## Quick Reference: Supported Providers

| Provider | API Format | Auth | Base URL |
|---|---|---|---|
| DeepSeek | OpenAI-compatible | API Key | `https://api.deepseek.com` |
| OpenRouter | OpenAI-compatible | API Key | `https://openrouter.ai/api/v1` |
| OpenAI | Native | API Key | `https://api.openai.com/v1` |
| Anthropic | Native | API Key (x-api-key header) | `https://api.anthropic.com/v1` |
| Google Gemini | Native | API Key (query param) | `https://generativelanguage.googleapis.com/v1beta` |
| Groq | OpenAI-compatible | API Key | `https://api.groq.com/openai/v1` |
| Mistral | OpenAI-compatible | API Key | `https://api.mistral.ai/v1` |
| Together AI | OpenAI-compatible | API Key | `https://api.together.xyz/v1` |
| Perplexity | OpenAI-compatible | API Key | `https://api.perplexity.ai` |
| Cohere | Native | API Key (header) | `https://api.cohere.ai/v1` |
| Azure OpenAI | OpenAI-compatible | API Key + Endpoint | Custom per-deployment |
| Ollama | OpenAI-compatible | None (local) | `http://localhost:11434` |
| LM Studio | OpenAI-compatible | None (local) | `http://localhost:1234/v1` |

## Common API Patterns

### OpenAI-Compatible (Chat Completions)
Most providers support the OpenAI chat completions format:
```
POST {base_url}/chat/completions
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "model": "model-name",
  "messages": [{"role": "user", "content": "Hello"}],
  "max_tokens": 1000,
  "temperature": 0.7
}
```

### Balance/Credits Endpoints
- **DeepSeek**: `GET /user/balance` → `{ balance_infos: [{ total_balance: "12.34" }] }`
- **OpenRouter**: `GET /api/v1/credits` → `{ data: { total_credits, total_usage } }`
- **OpenRouter fallback**: `GET /api/v1/auth/key` → `{ data: { usage, limit } }`

## Adding a New Provider to ai-balance

1. Add settings to `package.json` under `aiBalance.providers.<name>.*`
2. Add fetch method in `balanceProvider.ts`
3. Add display logic in `statusBarManager.ts`
4. Add secret storage keys in `extension.ts`
5. Update the agent file `.github/agents/ai-balance-manager.agent.md`

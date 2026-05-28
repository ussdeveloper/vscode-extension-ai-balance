# AI Provider Specifications

Detailed information about each AI provider's API, authentication, and balance endpoints.

## DeepSeek

| Property | Value |
|---|---|
| Website | https://deepseek.com |
| API Base URL | `https://api.deepseek.com` |
| API Format | OpenAI-compatible |
| Auth Header | `Authorization: Bearer {key}` |
| Key Prefix | `sk-` |
| Balance Endpoint | `GET /user/balance` |
| Balance Response | `{ balance_infos: [{ total_balance: "12.34", granted_balance: "0", topp_up_balance: "12.34" }] }` |
| Models | `deepseek-chat`, `deepseek-reasoner` |
| Pricing | Pay-as-you-go, credits-based |

## OpenRouter

| Property | Value |
|---|---|
| Website | https://openrouter.ai |
| API Base URL | `https://openrouter.ai/api/v1` |
| API Format | OpenAI-compatible (with extras) |
| Auth Header | `Authorization: Bearer {key}` |
| Key Prefix | `sk-or-v1-` |
| Credits Endpoint | `GET /api/v1/credits` |
| Credits Response | `{ data: { total_credits: 65, total_usage: 9.57 } }` |
| Auth Key Endpoint | `GET /api/v1/auth/key` |
| Auth Key Response | `{ data: { label, usage, limit, is_free } }` |
| Models | Aggregates 300+ models from many providers |
| Special Headers | `X-Title`, `HTTP-Referer` for app identification |
| Pricing | Pay-as-you-go, credits-based |

## OpenAI

| Property | Value |
|---|---|
| Website | https://openai.com |
| API Base URL | `https://api.openai.com/v1` |
| API Format | Native (Chat Completions) |
| Auth Header | `Authorization: Bearer {key}` |
| Key Prefix | `sk-` or `sk-proj-` |
| Models | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1`, `o3`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` |
| Pricing | Per-token (input + output) |

## Anthropic

| Property | Value |
|---|---|
| Website | https://anthropic.com |
| API Base URL | `https://api.anthropic.com/v1` |
| API Format | Native (Messages API) |
| Auth Header | `x-api-key: {key}` (not Bearer!) |
| Key Prefix | `sk-ant-` |
| Version Header | `anthropic-version: 2023-06-01` |
| Models | `claude-sonnet-4-20250514`, `claude-3.5-sonnet`, `claude-3.5-haiku`, `claude-3-opus` |
| Pricing | Per-token (input + output) |

## Google Gemini

| Property | Value |
|---|---|
| Website | https://ai.google.dev |
| API Base URL | `https://generativelanguage.googleapis.com/v1beta` |
| API Format | Native (Generative Language API) |
| Auth Method | `?key={api_key}` query parameter |
| Models | `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` |
| Pricing | Free tier + paid per-token |

## Groq

| Property | Value |
|---|---|
| Website | https://groq.com |
| API Base URL | `https://api.groq.com/openai/v1` |
| API Format | OpenAI-compatible |
| Auth Header | `Authorization: Bearer {key}` |
| Models | `llama-4-scout`, `llama-3.3-70b`, `mixtral-8x7b`, `gemma2-9b`, `deepseek-r1-distill` |
| Pricing | Free tier + paid |

## Mistral AI

| Property | Value |
|---|---|
| Website | https://mistral.ai |
| API Base URL | `https://api.mistral.ai/v1` |
| API Format | OpenAI-compatible |
| Auth Header | `Authorization: Bearer {key}` |
| Models | `mistral-large`, `mistral-small`, `codestral`, `ministral` |
| Pricing | Per-token |

## Together AI

| Property | Value |
|---|---|
| Website | https://together.ai |
| API Base URL | `https://api.together.xyz/v1` |
| API Format | OpenAI-compatible |
| Auth Header | `Authorization: Bearer {key}` |
| Models | 200+ open-source models |
| Pricing | Per-token |

## Perplexity

| Property | Value |
|---|---|
| Website | https://perplexity.ai |
| API Base URL | `https://api.perplexity.ai` |
| API Format | OpenAI-compatible |
| Auth Header | `Authorization: Bearer {key}` |
| Models | `sonar-pro`, `sonar`, `sonar-deep-research` |
| Pricing | Per-token (includes web search) |

## Azure OpenAI

| Property | Value |
|---|---|
| Website | https://azure.microsoft.com/products/ai-services/openai-service |
| API Base URL | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` |
| API Format | OpenAI-compatible |
| Auth Header | `api-key: {key}` |
| API Version | Required query param: `?api-version=2024-02-15-preview` |
| Models | Same as OpenAI, deployed per resource |
| Pricing | Per-token, Azure subscription |

## Ollama (Local)

| Property | Value |
|---|---|
| Website | https://ollama.ai |
| API Base URL | `http://localhost:11434` |
| API Format | OpenAI-compatible (chat) + native |
| Auth | None (local) |
| Chat Endpoint | `POST /api/chat` or `POST /v1/chat/completions` |
| Models | Any pulled model: `llama3`, `mistral`, `codellama`, etc. |
| Pricing | Free (local) |

## LM Studio (Local)

| Property | Value |
|---|---|
| Website | https://lmstudio.ai |
| API Base URL | `http://localhost:1234/v1` |
| API Format | OpenAI-compatible |
| Auth | None (local) |
| Models | Any loaded GGUF model |
| Pricing | Free (local) |

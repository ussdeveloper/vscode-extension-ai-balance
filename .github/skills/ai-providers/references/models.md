# Model Reference

Comprehensive list of models per provider with naming conventions.

## OpenAI Models

| Model Name | Context | Description |
|---|---|---|
| `gpt-4.1` | 1M | Latest flagship, best overall |
| `gpt-4.1-mini` | 1M | Fast, affordable |
| `gpt-4.1-nano` | 1M | Cheapest, fastest |
| `gpt-4o` | 128K | Previous flagship |
| `gpt-4o-mini` | 128K | Previous affordable |
| `gpt-4-turbo` | 128K | Legacy |
| `o3` | 200K | Reasoning model |
| `o3-mini` | 200K | Fast reasoning |
| `o1` | 200K | Reasoning model |
| `o1-mini` | 128K | Fast reasoning |
| `o4-mini` | 200K | Latest reasoning |

## Anthropic Models

| Model Name | Context | Description |
|---|---|---|
| `claude-sonnet-4-20250514` | 200K | Latest Sonnet, best overall |
| `claude-3.5-sonnet-20241022` | 200K | Previous Sonnet |
| `claude-3.5-haiku-20241022` | 200K | Fast, affordable |
| `claude-3-opus-20240229` | 200K | Legacy flagship |

## Google Gemini Models

| Model Name | Context | Description |
|---|---|---|
| `gemini-2.5-pro-exp-03-25` | 1M | Latest Pro |
| `gemini-2.0-flash` | 1M | Fast |
| `gemini-2.0-flash-lite` | 1M | Cheapest |
| `gemini-1.5-pro` | 2M | Previous Pro |
| `gemini-1.5-flash` | 1M | Previous fast |

## DeepSeek Models

| Model Name | Context | Description |
|---|---|---|
| `deepseek-chat` | 64K | General purpose (V3) |
| `deepseek-reasoner` | 64K | Reasoning (R1) |

## Groq Models

| Model Name | Context | Description |
|---|---|---|
| `llama-4-scout-17b-16e-instruct` | 128K | Meta Llama 4 |
| `llama-3.3-70b-versatile` | 128K | Meta Llama 3.3 |
| `llama-3.1-8b-instant` | 128K | Fast 8B |
| `mixtral-8x7b-32768` | 32K | Mixtral |
| `gemma2-9b-it` | 8K | Google Gemma 2 |
| `deepseek-r1-distill-llama-70b` | 128K | DeepSeek R1 distilled |

## Mistral Models

| Model Name | Context | Description |
|---|---|---|
| `mistral-large-latest` | 128K | Latest large |
| `mistral-small-latest` | 32K | Small |
| `codestral-latest` | 256K | Code-focused |
| `ministral-3b-latest` | 32K | Tiny |

## Perplexity Models

| Model Name | Context | Description |
|---|---|---|
| `sonar-pro` | 200K | With web search |
| `sonar` | 127K | With web search |
| `sonar-deep-research` | 128K | Deep research |

## Model Naming Conventions

### OpenAI
`gpt-{version}{variant}` — e.g., `gpt-4o`, `gpt-4.1-mini`
`o{version}` — reasoning models: `o1`, `o3`, `o4-mini`

### Anthropic
`claude-{version}-{variant}-{date}` — e.g., `claude-sonnet-4-20250514`

### Google
`gemini-{version}-{variant}-{modifier}` — e.g., `gemini-2.5-pro-exp-03-25`

### DeepSeek
`deepseek-{variant}` — e.g., `deepseek-chat`, `deepseek-reasoner`

### OpenRouter
Uses original model names from each provider. Can also use OpenRouter-specific IDs.

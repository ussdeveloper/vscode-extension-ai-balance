# Common API Patterns

## OpenAI-Compatible Chat Completions

Most modern providers support this format:

```http
POST {base_url}/chat/completions
Authorization: Bearer {api_key}
Content-Type: application/json
```

```json
{
  "model": "model-name",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 1000,
  "temperature": 0.7,
  "stream": false
}
```

### Response
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "model-name",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

## Streaming (SSE)

Add `"stream": true` to the request body. Response is Server-Sent Events:

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: [DONE]
```

## Balance/Credits API Patterns

### DeepSeek
```
GET /user/balance
Authorization: Bearer sk-xxx
→ { balance_infos: [{ total_balance: "12.34" }] }
```

### OpenRouter Credits
```
GET /api/v1/credits
Authorization: Bearer sk-or-v1-xxx
→ { data: { total_credits: 65, total_usage: 9.57 } }
```

### OpenRouter Auth Key
```
GET /api/v1/auth/key
Authorization: Bearer sk-or-v1-xxx
→ { data: { label: "Free", usage: 9.57, limit: 0, is_free: true } }
```

## Authentication Methods

| Method | Header/Param | Used By |
|---|---|---|
| Bearer Token | `Authorization: Bearer {key}` | OpenAI, DeepSeek, OpenRouter, Groq, Mistral, Together, Perplexity |
| Custom Header | `x-api-key: {key}` | Anthropic |
| Query Param | `?key={key}` | Google Gemini |
| API Key Header | `api-key: {key}` | Azure OpenAI |
| None | — | Ollama, LM Studio |

## Rate Limiting

Most providers return these headers:
- `X-RateLimit-Limit` — requests allowed per window
- `X-RateLimit-Remaining` — requests remaining
- `X-RateLimit-Reset` — when the window resets

HTTP 429 = rate limited. Implement exponential backoff.

## Error Response Format

### OpenAI-compatible
```json
{
  "error": {
    "message": "Incorrect API key provided",
    "type": "invalid_request_error",
    "code": "invalid_api_key"
  }
}
```

### Anthropic
```json
{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key"
  }
}
```

## Provider-Specific Headers

### OpenRouter
- `X-Title` — App name shown in OpenRouter dashboard
- `HTTP-Referer` — Your site URL for rankings

### Anthropic
- `anthropic-version: 2023-06-01` — Required API version header
- `anthropic-beta` — Beta features

### Azure OpenAI
- `api-version: 2024-02-15-preview` — Required API version

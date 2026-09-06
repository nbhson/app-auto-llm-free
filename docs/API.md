# API Reference

OpenAI-compatible API của gateway. Dùng trực tiếp với `openai` SDK hoặc `curl`.

Base URL: `http://localhost:8080/v1` (kèm dashboard tại `http://localhost:3000`)

Auth: `Authorization: Bearer fgk-...` (virtual key tạo trong Dashboard hoặc `MASTER_KEY`).

## Endpoints

### POST /v1/chat/completions

Tạo chat completion. Hỗ trợ streaming + tools.

**Request**:

```json
{
  "model": "auto",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": false,
  "tools": [
    {
      "type": "function",
      "function": { "name": "get_weather", "parameters": { "type": "object", "properties": { "city": { "type": "string" } } } }
    }
  ],
  "tool_choice": "auto"
}
```

**Headers tùy chọn**:

| Header | Mô tả |
|--------|-------|
| `x-router` | Pin provider: `x-router: groq` |
| `x-router-tier` | Chọn tier: `tier1`, `tier2` |
| `x-request-id` | Idempotency / tracing |

**Response (non-stream)**:

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1715433600,
  "model": "groq/llama-3.3-70b-versatile",
  "choices": [
    { "index": 0, "message": { "role": "assistant", "content": "Hi!" }, "finish_reason": "stop" }
  ],
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
}
```

**Streaming** (`stream: true`):

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"},"index":0}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
```

Mid-stream error sẽ emit `data: {"error": {"message": "...", "type": "provider_error"}}\n\n` rồi close.

### GET /v1/models

Liệt kê models.

```bash
curl http://localhost:8080/v1/models -H "Authorization: Bearer fgk-xxx"
```

```json
{
  "object": "list",
  "data": [
    { "id": "groq/llama-3.3-70b-versatile", "object": "model", "owned_by": "groq", "context_length": 131072 },
    { "id": "gemini/gemini-2.0-flash", "object": "model", "owned_by": "gemini", "context_length": 1000000 }
  ]
}
```

Query `?provider=groq` để filter.

### POST /v1/embeddings

```json
{ "model": "bge-m3", "input": "Hello world" }
```

### POST /v1/images/generations

Dùng Pollinations hoặc provider hỗ trợ images.

```json
{ "model": "pollinations/flux", "prompt": "a cat", "n": 1, "size": "1024x1024" }
```

### GET /v1/health

Không cần auth, trả status gateway + provider pool.

### Admin API (`/api/*`, cần `MASTER_KEY` hoặc `admin` role)

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/api/keys` | Tạo virtual key |
| `GET` | `/api/keys` | List keys |
| `DELETE` | `/api/keys/:id` | Xóa key |
| `GET` | `/api/providers` | List providers + config |
| `GET` | `/api/providers/health` | Test all keys |
| `GET` | `/api/stats` | QPS, latency, fallback rate |
| `GET` | `/api/logs` | Paginated logs |
| `GET` | `/api/logs/stream` | SSE live logs |

**Tạo key**:

```bash
curl -X POST http://localhost:8080/api/keys \
  -H "Authorization: Bearer $MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "scopes": { "models": ["*"], "providers": ["*"] },
    "rpmLimit": 60,
    "tpdLimit": 100000
  }'
# -> { "key": "fgk-abc123...", "id": "..." }
```

## Model Aliases

`auto`, `gpt-4`, `gpt-3.5`, `claude-3`, `gemini`, `gemini-flash`, `llama`, `mistral`, `qwen`, `deepseek` sẽ được `smart-router` resolve sang best free model còn quota.

Ví dụ:

```ts
// Tất cả đều hoạt động, router tự chọn provider
{ model: "auto" }
{ model: "gpt-4" } // -> groq/llama-3.3-70b hoặc gemini-2.0-flash
{ model: "groq/llama-3.3-70b-versatile" } // pin chính xác
```

## Error Codes

| Status | Code | Mô tả |
|--------|------|-------|
| 401 | `invalid_api_key` | Sai `fgk-` key |
| 403 | `insufficient_scope` | Key không có quyền model/provider |
| 429 | `rate_limit_exceeded` | Vượt RPM/TPM, kèm `Retry-After` |
| 429 | `provider_rate_limit` | Provider hết quota, gateway đã fallback hết pool |
| 502 | `provider_error` | Tất cả provider fail, kèm `provider_errors` array |
| 504 | `provider_timeout` | Upstream timeout |

## Rate Limit Headers

```
x-ratelimit-limit-requests: 60
x-ratelimit-remaining-requests: 59
x-ratelimit-limit-tokens: 100000
x-ratelimit-remaining-tokens: 99900
retry-after: 12
```

## SDK Examples

**OpenAI Python**:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="fgk-xxx")
print(client.chat.completions.create(model="auto", messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
```

**Vercel AI SDK**:

```ts
import { createOpenAI } from "@ai-sdk/openai";
const openai = createOpenAI({ baseURL: "http://localhost:8080/v1", apiKey: "fgk-xxx" });
```

**LangChain**:

```ts
import { ChatOpenAI } from "@langchain/openai";
const llm = new ChatOpenAI({ configuration: { baseURL: "http://localhost:8080/v1" }, apiKey: "fgk-xxx", model: "auto" });
```

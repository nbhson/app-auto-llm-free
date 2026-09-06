# API Reference

OpenAI-compatible API của gateway (30 providers freellms, 316 free models). Dùng trực tiếp với `openai` SDK hoặc `curl`.

Base URL: `http://localhost:8080/v1` (kèm dashboard tại `http://localhost:3000`)

Auth: `Authorization: Bearer fgk-...` (virtual key tạo trong Dashboard hoặc `MASTER_KEY`). Health không cần auth.

## Endpoints

### POST /v1/chat/completions

Tạo chat completion. Hỗ trợ streaming + tools. Gateway thử 4-tier fallback (`nvidia-nim/groq/cerebras/gemini` → `cloudflare/cohere` → `ovh/modelscope/llm7` → `openrouter/kilo/pollinations`).

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

Model có thể là alias (`auto`, `gpt-4`, `glm`, `qwen`, `code`, `embedding`) hoặc full `nvidia-nim/z-ai/glm-5.2`, `google-gemini/gemini 3.6 flash`, `groq/qwen/qwen3-32b`. Router resolve theo `providers/registry.ts:42`.

**Headers tùy chọn**:

| Header | Mô tả |
|--------|-------|
| `x-router` | Pin provider: `x-router: nvidia-nim` hoặc `x-router: groq` |
| `x-router-tier` | Chọn tier: `tier1`, `tier2` (sắp tới) |
| `x-request-id` | Idempotency / tracing |

**Response (non-stream)**:

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1715433600,
  "model": "nvidia-nim/z-ai/glm-5.2",
  "choices": [
    { "index": 0, "message": { "role": "assistant", "content": "Hi!" }, "finish_reason": "stop" }
  ],
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
}
```

Khi không có key (dev), gateway trả `_mock: true` với `_errors` để debug tier.

**Streaming** (`stream: true`):

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"},"index":0}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
```

Mid-stream error sẽ emit `data: {"error": {"message": "...", "type": "provider_error"}}\n\n` rồi close.

### GET /v1/models

Liệt kê models (freellms 316 + alias). Hỗ trợ lọc live verify (xem `docs/OPERATIONS.md`).

```bash
curl http://localhost:8080/v1/models -H "Authorization: Bearer fgk-xxx"
# Chỉ verified_free (thực sự còn free sau probe 24h)
curl "http://localhost:8080/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx"
# Deprecated (freellms nói free nhưng live không còn)
curl "http://localhost:8080/v1/models?verified=deprecated" -H "Authorization: Bearer fgk-xxx"
# Filter theo provider
curl "http://localhost:8080/v1/models?provider=nvidia-nim" -H "Authorization: Bearer fgk-xxx"
# Kết hợp
curl "http://localhost:8080/v1/models?provider=groq&verified=free" -H "Authorization: Bearer fgk-xxx"
```

**Response**:

```json
{
  "object": "list",
  "data": [
    { "id": "nvidia-nim/z-ai/glm-5.2", "object": "model", "owned_by": "nvidia-nim", "context_length": 1048576, "score": 94, "tier": "permanent", "capabilities": ["text","reasoning"], "limit": "Up to 40 RPM", "live_status": "verified_free", "last_verified": "2026-09-06T08:01:55.995Z" },
    { "id": "auto", "object": "model", "owned_by": "gateway", "live_status": "alias" }
  ],
  "total": 319,
  "free": 316,
  "verified": { "total_verified_free": 314, "total_deprecated": 0, "total_unverified_no_key": 0 },
  "filters": { "provider": null, "verified": "free" }
}
```

Query params:

| Param | Mô tả |
|-------|-------|
| `provider` | `nvidia-nim`, `groq`, `google-gemini`, `modelscope`… hoặc `gateway` cho alias |
| `verified` | `free` → chỉ `verified_free`, `deprecated` → chỉ deprecated, `unverified` → unverified_no_key/error, omit → tất cả freellms 316 |
| `free` | `0` để hiển thị cả paid (hiện tất cả freellms đều free nên ít dùng) |

`GET /v1/models/:id` (ví dụ `/v1/models/nvidia-nim/z-ai/glm-5.2`) trả chi tiết + `live_status`.

### POST /v1/embeddings

```json
{ "model": "cohere/embed-v3", "input": "Hello world" }
```

Stub P1 (P5 sẽ proxy tới Cohere/NVIDIA embedding). Trả mock embedding 8 dims.

### POST /v1/images/generations

Dùng Pollinations hoặc provider hỗ trợ images.

```json
{ "model": "pollinations/flux", "prompt": "a cat", "n": 1, "size": "1024x1024" }
```

### GET /v1/health

Không cần auth, trả status gateway + provider pool.

```json
{ "status":"ok", "providers":40, "tiers":[["nvidia-nim","groq",...]], "uptime":123 }
```

### Admin API (`/api/*`, cần `MASTER_KEY` hoặc `admin` role)

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/api/keys` | Tạo virtual key `fgk-...` |
| `GET` | `/api/keys` | List keys (stub P4) |
| `DELETE` | `/api/keys/:id` | Xóa key |
| `GET` | `/api/providers` | List providers + `detailed[]` (free_models, verified_free, keys, status, caps) |
| `GET` | `/api/providers/health` | Test all keys (stub, P3 sẽ ping 30 providers) |
| `GET` | `/api/stats` | QPS, latency, `free_models:316`, `providers:40` |
| `GET` | `/api/models/sync` | Freellms sync info (source, last_sync, script) |
| `GET` | `/api/verify` | Full live verify report `data/verified-models.json` (316 rows, status per model) |
| `GET` | `/api/verify/summary` | Summary nhanh (`total_verified_free`, `deprecated`, `unverified_no_key`, per-provider) |
| `POST` | `/api/verify` | Trigger verify ngay `{dryRun:false}` → chạy `verifyFreeModels()` + save |
| `GET` | `/api/logs` | Paginated logs (P4) |
| `GET` | `/api/logs/stream` | SSE live logs (P4) |

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

**Verify live** (kiểm tra tier thực sự còn free không — xem `docs/OPERATIONS.md`):

```bash
# Xem summary
curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer $MASTER_KEY" | jq

# Trigger live probe (cần keys trong .env, nếu không sẽ dry-run)
curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"dryRun":false}' | jq '.total_verified_free'

# Chỉ lấy models thực sự còn free sau probe
curl "http://localhost:8080/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx" | jq '.total'
```

## Model Aliases (freellms-aware)

`auto`, `gpt-4`, `gpt-3.5`, `claude-3`, `gemini`, `gemini-flash`, `llama`, `qwen`, `glm`, `kimi`, `code`, `embedding`, `rerank`, `deepseek`, `mistral` sẽ được `smart-router` resolve.

Ví dụ:

```ts
{ model: "auto" } // -> nvidia-nim/z-ai/glm-5.2 hoặc groq/qwen3...
{ model: "gpt-4" } // -> groq/cerebras/gemini/openrouter
{ model: "glm" } // -> z-ai-zhipu-ai/nvidia-nim/modelscope
{ model: "qwen" } // -> modelscope/ovhcloud/siliconflow/alibaba
{ model: "code" } // -> kilo-code/opencode/cohere/mistral-ai
{ model: "nvidia-nim/z-ai/glm-5.2" } // pin chính xác
```

Chi tiết alias map: `apps/gateway/src/providers/registry.ts:42`.

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
x-provider: nvidia-nim
```

## SDK Examples

**OpenAI Python**:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="fgk-xxx")
print(client.chat.completions.create(model="auto", messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
# Verified only
print(client.models.list(extra_query={"verified":"free"}))
```

**Vercel AI SDK**:

```ts
import { createOpenAI } from "@ai-sdk/openai";
const openai = createOpenAI({ baseURL: "http://localhost:8080/v1", apiKey: "fgk-xxx" });
```

**LangChain**:

```ts
import { ChatOpenAI } from "@langchain/openai";
const llm = new ChatOpenAI({ configuration: { baseURL: "http://localhost:8080/v1" }, apiKey: "fgk-xxx", model: "nvidia-nim/z-ai/glm-5.2" });
```

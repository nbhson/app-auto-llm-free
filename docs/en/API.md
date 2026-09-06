> **English** | [🇻🇳 Tiếng Việt](../vi/API.md) | [Docs Index](../README.md)

# API Reference

OpenAI-compatible gateway API (43 provider IDs — 30 freellms + 13 aliases, 324 models — 316 freellms + 8 alias/persisted). Use directly with the `openai` SDK or `curl`.

Base URL: `http://localhost:8080/v1` (with dashboard at `http://localhost:3000`)

Auth: `Authorization: Bearer fgk-...` (virtual key created in the Dashboard or `MASTER_KEY`). Health check requires no auth.

## Endpoints

### POST /v1/chat/completions

Create a chat completion. Supports streaming and tools. The gateway tries a 4-tier fallback (`nvidia-nim/groq/cerebras/gemini` → `cloudflare/cohere` → `ovh/modelscope/llm7` → `openrouter/kilo/pollinations`).

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

Model can be an alias (`auto`, `gpt-4`, `glm`, `qwen`, `code`, `embedding`, `kilo-auto`) or a full ID such as `nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`, `google-gemini/gemini-3.6-flash` (sanitized from `gemini 3.6 flash` -> `gemini-3.6-flash`), `openrouter/google/gemma-4-31b:free`. Freellms names containing spaces, `:` or `()` are sanitized in `openai-compatible.ts:31` and `models.ts:9`. The router resolves them via `providers/registry.ts:42`.

**Optional Headers**:

| Header | Description |
|--------|-------------|
| `x-router` | Pin a provider: `x-router: nvidia-nim` or `x-router: groq` |
| `x-router-tier` | Select tier: `tier1`, `tier2` (coming soon) |
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

When no provider key is configured (dev mode), the gateway returns `_mock: true` with `_errors` for tier debugging.

**Streaming** (`stream: true`):

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"},"index":0}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
```

Mid-stream errors emit `data: {"error": {"message": "...", "type": "provider_error"}}\n\n` and then close the connection.

### GET /v1/models

List models (324 — 316 freellms + 8 alias/persisted, pagination with LOV 25/50 sticky). Supports live-verify filtering (see `docs/OPERATIONS.md`).

```bash
curl http://localhost:8080/v1/models -H "Authorization: Bearer fgk-xxx"
# Pagination LOV 25/50
curl "http://localhost:8080/v1/models?page=1&limit=25" -H "Authorization: Bearer fgk-xxx"
curl "http://localhost:8080/v1/models?page=2&limit=50&q=gemma" -H "Authorization: Bearer fgk-xxx"
# Only verified_free (still free after 24h probe)
curl "http://localhost:8080/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx"
# Deprecated (freellms says free but live is no longer free, includes persisted 404/410)
curl "http://localhost:8080/v1/models?verified=deprecated" -H "Authorization: Bearer fgk-xxx"
# Filter by provider
curl "http://localhost:8080/v1/models?provider=nvidia-nim" -H "Authorization: Bearer fgk-xxx"
# Combined + search
curl "http://localhost:8080/v1/models?provider=groq&verified=free&q=llama&page=1&limit=25" -H "Authorization: Bearer fgk-xxx"
```

**Response**:

```json
{
  "object": "list",
  "data": [
    { "id": "nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b", "object": "model", "owned_by": "nvidia-nim", "context_length": 1048576, "score": 94, "tier": "permanent", "capabilities": ["text","reasoning"], "limit": "Up to 40 RPM", "live_status": "verified_free", "last_verified": "2026-09-06T08:01:55.995Z" },
    { "id": "auto", "object": "model", "owned_by": "gateway", "live_status": "alias" }
  ],
  "total": 324,
  "free": 316,
  "verified": { "total_verified_free": 314, "total_deprecated": 0, "total_unverified_no_key": 0 },
  "pagination": { "page": 1, "limit": 25, "total": 324, "total_pages": 13, "has_next": true, "has_prev": false },
  "filters": { "provider": null, "verified": "free", "q": null }
}
```

Query params:

| Param | Description |
|-------|-------------|
| `provider` | `nvidia-nim`, `groq`, `google-gemini`, `modelscope`… or `gateway` for aliases |
| `verified` | `free` → only `verified_free`, `deprecated` → only deprecated (including persisted 404/410), `unverified` → unverified_no_key/error, omit → all 324 |
| `q` | Search `id/display_name/provider` (e.g. `gemma`, `nvidia`) |
| `page` | 1-indexed page (default 1) |
| `limit` `per_page` | LOV `25` or `50` (default 25) |
| `free` | `0` to show paid as well (all freellms are currently free, so rarely used) |

`GET /v1/models/:id` (e.g. `/v1/models/nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`) returns details plus `live_status` and `persisted_404`.

### POST /v1/embeddings

```json
{ "model": "cohere/embed-v3", "input": "Hello world" }
```

Stub P1 (P5 will proxy to Cohere/NVIDIA embeddings). Returns a mock 8-dim embedding.

### POST /v1/images/generations

Uses Pollinations or any provider that supports images.

```json
{ "model": "pollinations/flux", "prompt": "a cat", "n": 1, "size": "1024x1024" }
```

### GET /v1/health

No auth required; returns gateway status and provider pool.

```json
{ "status":"ok", "providers":43, "tiers":[["nvidia-nim","groq",...]], "uptime":123 }
```

### Admin API (`/api/*`, requires `MASTER_KEY` or `admin` role)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/keys` | Create virtual key `fgk-...` (SHA256 hash, scopes, RPM) |
| `GET` | `/api/keys` | List keys + `requestCount` |
| `DELETE` | `/api/keys/:id` | Delete a key |
| `GET` | `/api/providers?page=&limit=&q=` | List providers + `detailed[]` (free_models, keys, caps, `Get Key` URL) — pagination 25/50 LOV |
| `GET` | `/api/providers/health` | Live ping of 43 providers in parallel, 5s (online/offline/no-key, latency, breaker) |
| `GET` | `/api/models/health?model=` | Probe **1 model** with live chat `Hi` 5 tokens 8s → `usable/unusable/no-key/timeout` + `410 Gone` |
| `GET` | `/api/models/health?provider=&limit=` | Bulk probe `limit` models of a provider (summary usable/unusable) |
| `GET` | `/api/models/health/:id` | Probe 1 model by full id (e.g. `nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`) |
| `GET` | `/api/models/health/persisted` | List persisted 404/410 (`data/model-health.json`) — keeps strikethrough after reload |
| `POST` | `/api/models/health/mark` | Mark 404/410 `{ids:[],http_status:404,error:"model_not_found"}` -> persist + router skip |
| `DELETE` | `/api/models/health/persisted/:id` | Remove one persisted entry, `DELETE /api/models/health/persisted` removes all |
| `GET` | `/api/stats` | `allTimeTokens`, `tokensByProvider`, `avgTokens`, `providers:43`, `free_models:324`, `breakers` |
| `GET` | `/api/models/sync` | Freellms sync info (source, last_sync, script) |
| `GET` | `/api/verify` | Full live verify `data/verified-models.json` (316 rows, `verified_free/deprecated`) |
| `GET` | `/api/verify/summary` | Quick summary (per-provider) |
| `POST` | `/api/verify` | Trigger verify `{dryRun:false}` |
| `GET` | `/api/logs` | Paginated logs (`promptTokens/completionTokens/totalTokens`) |
| `GET` | `/api/logs/stream` | SSE live logs |

**Create a key**:

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

**Verify live** (check whether the tier is still actually free — see `docs/OPERATIONS.md`):

```bash
# View summary
curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer $MASTER_KEY" | jq

# Trigger live probe (requires keys in .env, otherwise dry-run)
curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"dryRun":false}' | jq '.total_verified_free'

# Only models still free after probing
curl "http://localhost:8080/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx" | jq '.total'
```

## Model Aliases (freellms-aware)

`auto`, `gpt-4`, `gpt-3.5`, `claude-3`, `gemini`, `gemini-flash`, `llama`, `qwen`, `glm`, `kimi`, `code`, `embedding`, `rerank`, `deepseek`, `mistral` are resolved by the `smart-router`.

Examples:

```ts
{ model: "auto" } // -> nvidia-nim/z-ai/glm-5.2 or groq/qwen3...
{ model: "gpt-4" } // -> groq/cerebras/gemini/openrouter
{ model: "glm" } // -> z-ai-zhipu-ai/nvidia-nim/modelscope
{ model: "qwen" } // -> modelscope/ovhcloud/siliconflow/alibaba
{ model: "code" } // -> kilo-code/opencode/cohere/mistral-ai
{ model: "nvidia-nim/z-ai/glm-5.2" } // pin exact model
```

Alias map details: `apps/gateway/src/providers/registry.ts:42`.

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `invalid_api_key` | Invalid `fgk-` key |
| 403 | `insufficient_scope` | Key lacks permission for the model/provider |
| 429 | `rate_limit_exceeded` | RPM/TPM exceeded, includes `Retry-After` |
| 429 | `provider_rate_limit` | Provider quota exhausted, gateway has exhausted fallback pool |
| 502 | `provider_error` | All providers failed, includes `provider_errors` array |
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

# Providers

Danh sách provider free được hỗ trợ và cách thêm provider mới.

## 1. Phân loại

### A. Chính thống free tier (cần API key, có rate limit rõ ràng)

| Provider | Base URL | Free tier (2026) | Model tiêu biểu | Adapter |
|----------|----------|------------------|-----------------|---------|
| **Groq** | `https://api.groq.com/openai/v1` | 30 RPM, 14.4K RPD | `llama-3.3-70b`, `mixtral-8x7b` | `openai-compatible` |
| **Cerebras** | `https://api.cerebras.ai/v1` | 30 RPM, 1K RPD | `llama3.1-8b`, `llama3.1-70b` | `openai-compatible` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta` | 60 RPM, 1.5K RPD | `gemini-2.0-flash`, `gemini-1.5-flash` | `gemini` |
| **Together AI** | `https://api.together.xyz/v1` | $25 credit free | `llama-3.3-70b`, `qwen2-72b` | `openai-compatible` |
| **Mistral** | `https://api.mistral.ai/v1` | 5 RPS free | `mistral-small`, `mistral-nemo` | `openai-compatible` |
| **Cohere** | `https://api.cohere.ai/compatibility/v1` | Trial free | `command-r`, `command-r-plus` | `openai-compatible` |
| **HuggingFace** | `https://api-inference.huggingface.co/v1` | Rate limit IP | `llama-3.2-3b`, `qwen2.5-*` | `openai-compatible` |
| **GitHub Models** | `https://models.inference.ai.azure.com` | Free với GitHub PAT | `gpt-4o-mini`, `llama-3.3` | `openai-compatible` |
| **Cloudflare Workers AI** | `https://api.cloudflare.com/client/v4/accounts/.../ai/v1` | 10K req/ngày | `llama-3.1-8b` | `openai-compatible` |
| **Nvidia NIM** | `https://integrate.api.nvidia.com/v1` | Free tier | `llama-3.1-405b` | `openai-compatible` |
| **SiliconFlow** | `https://api.siliconflow.cn/v1` | Free credit | `deepseek-v3`, `qwen2.5` | `openai-compatible` |
| **SambaNova** | `https://api.sambanova.ai/v1` | Free tier | `llama-3.1-405b` | `openai-compatible` |
| **Chutes** | `https://llm.chutes.ai/v1` | Free | `deepseek-v3` | `openai-compatible` |
| **Fireworks** | `https://api.fireworks.ai/inference/v1` | $1 free | `llama-3.3-70b` | `openai-compatible` |
| **DeepSeek** | `https://api.deepseek.com/v1` | Free trial | `deepseek-chat`, `deepseek-reasoner` | `openai-compatible` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | 28+ free models | `auto` free | `openai-compatible` |

> Nguồn tham khảo: `free-llm-gateway` (24+ providers) và OmniRoute (90 free, 40 forever free). Giá trị free tier sẽ sync định kỳ từ LiteLLM pricing dataset.

### B. Scraped / Unlimited (không cần key hoặc key cộng đồng, dễ vỡ)

| Provider | Endpoint | Đặc điểm | Adapter |
|----------|----------|----------|---------|
| **Pollinations** | `https://text.pollinations.ai/openai` | OpenAI-compatible, không cần key | `scraped` |
| **Puter** | `https://api.puter.com/drivers/call` | Unlimited, cần `puter` auth trick | `scraped` |
| **LLM7** | `https://api.llm7.io/v1` | Free, OpenAI-compatible | `scraped` |
| **Ollama Cloud** | `https://ollama.com/v1` | Free tier | `openai-compatible` |
| **Kilo / Z AI / ModelScope** | — | Free | `openai-compatible` |

> Cảnh báo: nhóm này không ổn định, cần `health` cron và auto-disable.

## 2. Model Catalog

`models.yaml` auto-discovery (port từ `sync_providers.py`):

```yaml
- id: groq/llama-3.3-70b-versatile
  provider: groq
  context_length: 131072
  free_tier: { rpm: 30, rpd: 14400 }
  aliases: [llama-3.3-70b, auto]
- id: gemini/gemini-2.0-flash
  provider: gemini
  context_length: 1000000
  aliases: [gemini-flash, gemini]
```

Dashboard `/models` hiển thị 260+ models, filter `free forever`.

**Alias thông minh** (`smart_default`):

```
auto           -> provider rẻ nhất còn quota
gpt-4 / gpt4   -> groq/llama-3.3-70b hoặc gemini-2.0-flash
claude-3       -> cohere/command-r-plus hoặc huggingface fallback
gemini-flash   -> gemini/gemini-2.0-flash
llama          -> groq/llama-3.3-70b
```

## 3. Thêm provider mới

1. Tạo `apps/gateway/src/providers/<id>.ts` implement `Provider`:

```ts
import type { Provider, ChatRequest } from "./base.js";

export const myProvider: Provider = {
  id: "my-provider",
  type: "openai-compatible",
  async chat(req: ChatRequest, apiKey: string) {
    return fetch("https://api.myprovider.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: req.stream,
        temperature: req.temperature,
      }),
    });
  },
  async models() {
    return [{ id: "my-model", provider: "my-provider", context_length: 8192 }];
  },
  async health(apiKey: string) {
    const res = await fetch("https://api.myprovider.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  },
};
```

2. Đăng ký trong `apps/gateway/src/providers/registry.ts`:

```ts
import { myProvider } from "./my-provider.js";
export const providers = { groq, gemini, cerebras, myProvider };
```

3. Thêm env vào `.env.example`:

```env
MY_PROVIDER_API_KEYS=sk_xxx,sk_yyy
```

4. Thêm vào `models.yaml` và chạy `bun run sync:providers`.

5. Test:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer fgk-xxx" \
  -H "x-router: my-provider" \
  -d '{"model":"my-model","messages":[{"role":"user","content":"hi"}]}'
```

Với `gemini`/`anthropic` type, cần thêm `format-translator` (tham khảo `apps/gateway/src/lib/format-translator.ts`).

## 4. Health Check

`GET /api/providers/health` — 1-click test all keys (như `free-llm-gateway`):

```json
{
  "groq": { "ok": true, "latencyMs": 123, "models": 8 },
  "gemini": { "ok": false, "error": "429 rate limit" }
}
```

Cron mỗi 5 phút tự disable provider fail.

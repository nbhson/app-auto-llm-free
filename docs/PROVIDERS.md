# Providers

> **Nguồn chính: freellms.org (scan 2026-09-06) — 30 providers, 316 free models.**  
> Chi tiết đầy đủ: [`docs/FREELLMS_FREE_TIER.md`](FREELLMS_FREE_TIER.md) + `data/freellms-providers.json:1` / `data/freellms-models-free.json:1`  
> Gateway `apps/gateway/src/providers/registry.ts:1` đã tích hợp đủ 30 providers, `models.yaml:1` đã sync 316 free.

## 1. Tổng quan freellms.org

| Chỉ số | Giá trị |
|--------|---------|
| Providers | **30** (26 Permanent Free, 4 Quota) |
| Models | **365** (316 FREE `data-free=1`, 49 paid) |
| No Card | 29/30 (chỉ Grok xAI yêu cầu) |
| OpenAI Compatible | 30/30 |
| Scan date | 2026-09-06, script `scripts/sync-freellms.py` |

## 2. Danh sách 30 providers (từ freellms.org)

### Permanent Free — No Card (ưu tiên P0)

| Provider | Slug | Base URL | Free Models | Limit | Caps | Env Key |
|----------|------|----------|-------------|-------|------|---------|
| **NVIDIA NIM** | `nvidia-nim` | `https://integrate.api.nvidia.com/v1` | 97 | Up to 40 RPM, 8K–1M | text,reasoning,image,video,embedding | `NVIDIA_API_KEYS` |
| **ModelScope** | `modelscope` | `https://api-inference.modelscope.cn/v1` | 43 | 2K RPD total, ≤500/model | text,image,video,audio | `MODELSCOPE_API_KEYS` |
| **Cloudflare Workers AI** | `cloudflare-workers-ai` | `https://api.cloudflare.com/client/v4/accounts/{id}/ai/run` | 35 | 10K neurons/day | text,image,reasoning,code | `CLOUDFLARE_API_TOKEN` + `ACCOUNT_ID` |
| **Google Gemini** | `google-gemini` / `gemini` | `https://generativelanguage.googleapis.com/v1beta` | 15 | 15 RPM/1.5K RPD (Flash), 30 RPM Lite | text,image,video,audio | `GEMINI_API_KEYS` |
| **OVHcloud AI Endpoints** | `ovhcloud-ai-endpoints` | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | 10 | 2 RPM anon | text,image,video | `OVHCLOUD_API_KEYS` |
| **Cohere** | `cohere` | `https://api.cohere.com/v2` | 10 | — | text,reasoning,embedding,rerank | `COHERE_API_KEYS` |
| **SambaNova** | `sambanova` | `https://api.sambanova.ai/v1` | 4 | — | text,reasoning | `SAMBANOVA_API_KEYS` |
| **SiliconFlow** | `siliconflow` | `https://api.siliconflow.cn/v1` | 2 | — | text,reasoning | `SILICONFLOW_API_KEYS` |
| **Chutes.ai** | `chutes-ai` / `chutes` | `https://api.chutes.ai/v1` | 2 | — | text,reasoning | `CHUTES_API_KEYS` |
| **Glhf.chat** | `glhf-chat` / `glhf` | `https://glhf.chat/api/openai/v1` | 2 | — | text | `GLHF_API_KEYS` |
| **Z AI (Zhipu)** | `z-ai-zhipu-ai` | `https://open.bigmodel.cn/api/paas/v4` | 4 | — | text,reasoning | `Z_AI_API_KEYS` |
| **Agnes AI** | `agnes-ai` | `https://apihub.agnes-ai.com/v1` | 5 | 30 RPM | text,vision | `AGNES_API_KEYS` |
| **Aion Labs** | `aion-labs` | `https://api.aionlabs.ai/v1` | 5 | — | text | `AION_API_KEYS` |
| **LLM7.io** | `llm7-io` | `https://api.llm7.io/v1` | 6 | — | text,reasoning | `LLM7_API_KEYS` |
| **Cerebras** | `cerebras` | `https://api.cerebras.ai/v1` | 5 | 15 RPM/30K TPM/1M TPD, 128K ctx | text,reasoning | `CEREBRAS_API_KEYS` |
| **Groq** | `groq` | `https://api.groq.com/openai/v1` | 7 / 23 total | 30 RPM/250 RPD primary, 14.4K RPD large | text,reasoning | `GROQ_API_KEYS` |
| **Hugging Face** (quota) | `hugging-face` | `https://router.huggingface.co/v1` | 4 | IP limit | text,code | `HUGGINGFACE_API_KEYS` |
| **OpenCode Zen** | `opencode` | `https://opencode.ai/zen/v1` | 8 | — | reasoning,vision | `OPENCODE_API_KEYS` |
| **Ollama Cloud** | `ollama-cloud` | `https://api.ollama.com` | 3 / 8 total | Session/weekly limits | text,reasoning | `OLLAMA_CLOUD_API_KEYS` |
| **Groq xAI** | `grok-xai` / `xai` | `https://api.x.ai/v1` | 2 | — | text | `GROK_API_KEYS` / `XAI_API_KEYS` |

### Quota / Trial (P1 — dùng sau Permanent)

| Provider | Slug | Free | Limit | Env Key |
|----------|------|------|-------|---------|
| **GitHub Models** | `github-models` | 13 | PAT, quota | `GITHUB_TOKENS` |
| **Mistral AI** | `mistral-ai` / `mistral` | 9 | 5 RPS free | `MISTRAL_API_KEYS` |
| **Kilo Code** | `kilo-code` | 8 | ~200 req/hr, `:free` suffix | `KILO_CODE_API_KEYS` |
| **Hugging Face** | `hugging-face` | 4 | — | `HUGGINGFACE_API_KEYS` |

### Legacy / extra (vẫn hỗ trợ)

| Provider | Base URL | Env |
|----------|----------|-----|
| Together AI | `https://api.together.xyz/v1` | `TOGETHER_API_KEYS` |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEYS` |
| Novita | `https://api.novita.ai/v3/openai` | `NOVITA_API_KEYS` |
| DeepSeek | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEYS` |
| Pollinations | `https://text.pollinations.ai/openai` | `POLLINATIONS_API_KEY` (không cần) |

> Cảnh báo scraped: Pollinations/LLM7 không ổn định, cần health cron và auto-disable trong P3.

## 3. Model Catalog — 316 free models

`models.yaml:1` đã được sync từ freellms:

```bash
python scripts/sync-freellms.py   # fetch freellms.org -> data/*.json + models.yaml
# hoặc
npm run sync:freellms -w apps-gateway
```

Mỗi entry:

```yaml
- id: nvidia-nim/z-ai/glm-5.2
  provider: nvidia-nim
  context_length: 1048576
  score: 94
  tier: permanent
  verified: true
  capabilities: [text, reasoning]
  limit: "Up to 40 RPM"
```

Dashboard `/models` (Vite) và `GET /v1/models?provider=nvidia-nim` phục vụ từ `data/freellms-models-free.json:1` (316 rows, có `score`, `verified`, `limit`). Alias vẫn hỗ trợ:

```
auto           -> nvidia-nim, groq, cerebras, google-gemini, cloudflare
gpt-4 / gpt4   -> groq, cerebras, google-gemini, openrouter, nvidia-nim
claude-3       -> cohere, hugging-face, openrouter, mistral-ai
gemini-flash   -> google-gemini
llama          -> groq, cerebras, nvidia-nim, sambanova, ovhcloud
qwen           -> modelscope, ovhcloud, siliconflow, alibaba
glm            -> z-ai-zhipu-ai, nvidia-nim, modelscope
code           -> kilo-code, opencode, cohere, mistral-ai
```

Chi tiết top 30 theo score: xem `docs/FREELLMS_FREE_TIER.md:1`.

## 4. Fallback Tiers (đã cập nhật trong .env.example & config.ts)

```env
FALLBACK_TIERS=[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io","hugging-face"],["openrouter","kilo-code","pollinations"]]
```

Router `apps/gateway/src/lib/router.ts:1` dùng tier này + `providerMeta` để fallback khi 429/timeout.

## 5. Thêm provider mới

1. Thêm env vào `.env.example` (theo bảng trên)
2. Thêm vào `apps/gateway/src/config.ts:19` `providerKeys`
3. Đăng ký trong `apps/gateway/src/providers/registry.ts:1`:

```ts
export const myProvider = createOpenAICompatibleProvider({ id: "my-provider", baseUrl: "https://api.myprovider.com/v1" });
export const providers = { ..., myProvider };
```

4. Chạy `python scripts/sync-freellms.py` để cập nhật `models.yaml` nếu provider có trên freellms
5. Test:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer fgk-xxx" \
  -H "x-router: my-provider" \
  -d '{"model":"my-model","messages":[{"role":"user","content":"hi"}]}'
```

## 6. Health Check

`GET /api/providers` — trả `detailed[]` với `free_models`, `keys`, `status` từ freellms + config  
`GET /api/providers/health` — stub P3 sẽ ping tất cả 30 providers  
`GET /api/stats` — `providers: 30`, `free_models: 316`

> **Tiếng Việt** | [🇬🇧 English](../en/CONFIGURATION.md) | [Docs Index](../README.md)

# Cấu hình (Configuration)

## Biến môi trường

Xem `.env.example` đầy đủ (30 providers freellms.org). Dưới đây là nhóm quan trọng:

### Gateway

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `8080` | Port gateway |
| `NODE_ENV` | `development` | `development`/`production` |
| `DATABASE_URL` | `file:./data.db` | Drizzle DB — `file:./data.db` (SQLite) hoặc `postgres://user:pass@host/db` |
| `REDIS_URL` | `redis://localhost:6379` | Redis cho rate limit; nếu trống fallback in-memory |
| `MASTER_KEY` | (required) | Key admin `fgk-master-...` để tạo virtual keys |
| `ENCRYPTION_KEY` | (required) | 32 bytes hex cho AES-256-GCM (vd: `openssl rand -hex 32`) |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `CORS_ORIGIN` | `*` | Cho phép Dashboard |

### Provider Keys (pool, phân tách dấu phẩy) — freellms 30 providers

```env
# Core
GROQ_API_KEYS=gsk_xxx
CEREBRAS_API_KEYS=csk_xxx
NVIDIA_API_KEYS=nvapi-xxx
GITHUB_TOKENS=ghp_xxx
OPENROUTER_API_KEYS=sk-or-xxx
GEMINI_API_KEYS=AIza_xxx
CLOUDFLARE_API_TOKEN=cf_xxx
CLOUDFLARE_ACCOUNT_ID=acc_xxx

# Cohere / Mistral / SiliconFlow / SambaNova / Chutes / HuggingFace
COHERE_API_KEYS=co_xxx
MISTRAL_API_KEYS=mst_xxx
SILICONFLOW_API_KEYS=sk-xxx
SAMBANOVA_API_KEYS=sn_xxx
CHUTES_API_KEYS=ch_xxx
HUGGINGFACE_API_KEYS=hf_xxx

# Freellms — new (2026-09-06 scan, 316 free models)
MODELSCOPE_API_KEYS=ms_xxx
OVHCLOUD_API_KEYS=ovh_xxx
KILO_CODE_API_KEYS=kc_xxx
OPENCODE_API_KEYS=oc_xxx
LLM7_API_KEYS=llm7_xxx
AGNES_API_KEYS=ag_xxx
AION_API_KEYS=aion_xxx
Z_AI_API_KEYS=zai_xxx
OLLAMA_CLOUD_API_KEYS=ollama_xxx
GLHF_API_KEYS=glhf_xxx
GROK_API_KEYS=xai_xxx
ALIBABA_API_KEYS=sk-xxx
NSCALE_API_KEYS=nsc_xxx
NEBIUS_API_KEYS=nebius_xxx
AI21_API_KEYS=ai21_xxx
POLLINATIONS_API_KEY= # thường không cần
```

Để trống provider nào thì provider đó bị disable (trừ `pollinations`/`llm7-io` scraped tự động enable). Xem bảng đầy đủ trong `docs/PROVIDERS.md:1`.

### Router

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `DEFAULT_MODEL` | `auto` | model khi client không truyền |
| `FALLBACK_TIERS` | `[[...]]` | JSON tiers freellms: `[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io","hugging-face"],["openrouter","kilo-code","pollinations"]]` |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | fails để open |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | — |

## models.yaml — 316 free models (freellms)

Sync từ freellms.org:

```yaml
models:
  - id: "nvidia-nim/z-ai/glm-5.2"
    display_name: "z-ai/glm-5.2"
    provider: nvidia-nim
    context_length: 1048576
    score: 94
    tier: permanent
    verified: true
    capabilities: [text, reasoning]
    limit: "Up to 40 RPM"
```

Sync job (freellms):

```bash
python scripts/sync-freellms.py        # fetch freellms.org -> data/*.json + models.yaml
npm run sync:freellms -w apps-gateway  # alias
# legacy
bun run sync:providers   # fetch từ provider APIs + LiteLLM pricing (stub)
```

Gateway `GET /v1/models` đọc `data/freellms-models-free.json:1` (316 rows), `GET /api/providers` trả `detailed[]` với `free_models`, `limit`, `verified`.

## Rate Limit config — per-provider (từ freellms)

| Provider | RPM | RPD | TPM/TPD | Ghi chú |
|----------|-----|-----|---------|---------|
| NVIDIA NIM | 40 shared | — | — | phone required |
| Groq | 30 | 250–14.4K | — | per-model |
| Cerebras | 15 | — | 30K TPM / 1M TPD | — |
| Gemini Flash | 15 | 1.5K | — | — |
| Gemini Lite | 30 | 1.5K | — | — |
| OVH | 2 anon | — | — | — |
| Agnes | 30 | — | — | — |
| OpenRouter | — | 200 free | — | — |
| Kilo Code | ~200/hr | — | — | `:free` suffix |

Lưu trong `models.yaml:1` `limit` + `apps/gateway/src/lib/quota-tracker.ts` enforce. Token usage `allTimeTokens` + `tokensByProvider` từ `lib/request-log.ts:1` hiện Dashboard 4th card + Logs charts (recharts).

Trong `virtual_keys` table:

```json
{
  "rpmLimit": 60,
  "rpdLimit": 1000,
  "tpmLimit": 100000,
  "tpdLimit": 1000000,
  "scopes": { "models": ["*"], "providers": ["nvidia-nim","groq","google-gemini"] }
}
```

## Drizzle config

`drizzle.config.ts`:

```ts
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: process.env.DATABASE_URL.startsWith("postgres") ? "postgresql" : "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Migrate:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio   # GUI
```

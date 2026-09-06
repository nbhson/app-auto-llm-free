> **Tiếng Việt** | [🇬🇧 English](../en/CONFIGURATION.md) | [Docs Index](../README.md)

# Cấu hình (Configuration)

## Biến môi trường

Xem `.env.example` đầy đủ (30 providers freellms.org, live sync là source of truth — freellms disabled). Dưới đây là nhóm quan trọng:

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
| `CORS_ORIGIN` | `*` | Cho phép Dashboard (header 2 hàng + i18n VI/EN) |
| `SYNC_INTERVAL_MS` | `86400000` | 24h scheduler cho verify + live sync |
| `DISABLE_SCHEDULER` | `0` | Đặt `1` để tắt scheduler |

### Provider Keys (pool, phân tách dấu phẩy) — freellms 30 providers, live via real keys

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

# Freellms — new (2026-09-06 scan, 316 free models — lịch sử, live hiện 882 free)
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

Để trống provider nào thì provider đó bị disable (trừ `pollinations`/`llm7-io` scraped tự động enable). Real key check cho `hasKey`/`Sync Live Now`: `k.length>20 && !k.includes('xxx') && !k.includes('change-me')`. Xem bảng đầy đủ trong `docs/PROVIDERS.md:1`.

### Router

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `DEFAULT_MODEL` | `auto` | model khi client không truyền |
| `FALLBACK_TIERS` | `[[...]]` | JSON tiers freellms: `[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io","hugging-face"],["openrouter","kilo-code","pollinations"]]` |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | fails để open |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | — |

### Rate limit

`middleware/rate-limit.ts` — list endpoints (`/v1/models`, `/api/providers`, `/api/models/health`) được 4x (`Math.max(rpmLimit*4, 200)`), frontend debounce search `q` 400ms (Models/Providers) để giảm 429.

## models.yaml — 316 free models (freellms snapshot, lịch sử) + live-models.json (882 free)

Sync lịch sử từ freellms.org:

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

Sync job **mới** (live source of truth):

```bash
npx tsx apps/gateway/src/jobs/sync-live-models.ts        # fetch live -> data/live-models.json (2185 total, 882 free, freeOnly)
curl -X POST http://localhost:8080/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
# Lịch sử
python scripts/sync-freellms.py        # fetch freellms.org -> data/*.json + models.yaml (disabled)
npm run sync:freellms -w apps-gateway  # alias
```

Gateway `GET /v1/models` đọc `data/live-models.json:1` (live 882) khi `?hasKey=1` với real keys, ngược lại `data/freellms-models-free.json:1` (316 rows), `GET /api/providers` trả `detailed[]` với `free_models`, `hasRealKey` (highlight xanh lá), `limit`, `verified`, pagination LOV 25/50 ở sticky bottom (debounce 400ms).

## Rate Limit config — per-provider (từ freellms, live vẫn dùng)

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

Lưu trong `models.yaml:1` `limit` + `apps/gateway/src/lib/quota-tracker.ts` enforce + `middleware/rate-limit.ts` 4x cho list. Token usage `allTimeTokens` + `tokensByProvider` từ `lib/request-log.ts:1` hiện Dashboard 4th card + Logs charts (recharts, chỉ Live ON SSE + 2s poll).

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

## i18n

`apps/web/src/lib/i18n.tsx` — `VI/EN` dict, `LangProvider`, `localStorage lang` (`vi` default), selector trong header hàng 1 (cùng Master). Docs có `docs/vi/` + `docs/en/` với banner riêng, root `README.md` mặc định English + `README.vi.md` Vietnamese.

## Header 2 hàng

`apps/web/src/main.tsx:40` — `display: flex; flexDirection: column; gap:10`: hàng 1 `justifyContent: space-between` trái logo + health + `30 providers • 316 free` / phải `VI/EN` + `Master` input; hàng 2 nav 5 tabs căn giữa `alignSelf: center`. Trước đây single row với grid/nav centered — hiện đã tách 2 hàng.

## Persisted 404 + hide404

`data/model-health.json` + `localStorage hide404`/`hide404_migrated` — 404/410 strikethrough `line-through #dc2626`, disabled checkbox, `hide404` pill mặc định checked ẩn khỏi UI, `POST /api/models/health/mark` lưu.

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

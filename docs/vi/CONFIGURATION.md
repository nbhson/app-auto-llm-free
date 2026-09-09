> **Tiếng Việt** | [🇬🇧 English](../en/CONFIGURATION.md) | [Docs Index](../README.md)

# Cấu hình (Configuration)

## Biến môi trường

Xem `.env.example` đầy đủ (30 providers freellms.org, live sync là source of truth — freellms disabled). Dưới đây là nhóm quan trọng:

### Gateway

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `7373` | Port gateway |
| `NODE_ENV` | `development` | `development`/`production` |
| `DATABASE_URL` | `file:./data.db` | Drizzle DB — `file:./data.db` (SQLite) hoặc `postgres://user:pass@host/db` |
| `REDIS_URL` | `redis://localhost:6379` | Redis cho rate limit; nếu trống fallback in-memory |
| `MASTER_KEY` | (auto-generated) | 1 key duy nhất cho `/v1/*` + `/api/*` admin. Tự sinh `fgk-master-...` nếu thiếu/placeholder, lưu vào `.env` hoặc `data/.gateway-keys.json` (Docker). Override cho prod qua secret manager. |
| `ENCRYPTION_KEY` | (auto-generated) | Key nội bộ AES-256-GCM 32 bytes hex. Tự sinh 64 hex nếu thiếu, không dùng làm API key. |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `CORS_ORIGIN` | `*` | Cho phép Dashboard (header 2 hàng + i18n VI/EN) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | _(không đặt)_ | Chỉ dev sau proxy SSL inspection (Zscaler) khi gặp `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. `0` tắt verify → MITM, **không bao giờ prod**. An toàn hơn: `NODE_EXTRA_CA_CERTS=/path/to/ca.crt` |
| `SYNC_INTERVAL_MS` | `86400000` | 24h scheduler cho verify + live sync |
| `DISABLE_SCHEDULER` | `0` | Đặt `1` để tắt scheduler |
| `EXPOSE_BOOTSTRAP` | `0` (tắt mặc định, an toàn) | Public `GET /api/bootstrap` + `/api/config/master` trả `MASTER_KEY` cho UI local lần đầu (`app.ts:23`); đặt `1` để bật local only |

### Provider Keys (pool, phân tách dấu phẩy) — freellms 30 providers, live via real keys

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `ANTHROPIC_API_KEYS` | _(trống)_ | Key Anthropic cho `/v1/messages` (phân tách dấu phẩy, round-robin). Chỉ cần nếu proxy trực tiếp tới Anthropic; ngược lại adapter OpenAI tự dịch. |

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

# Anthropic (Vector 1+2 — /v1/messages)
ANTHROPIC_API_KEYS=sk-ant-xxx

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

# KiraAI Vietnam (https://kiraai.vn/api/v1) — OpenAI compatible, 150M free tokens/ngày
KIRAAI_API_KEYS=kira_xxx
```

Để trống provider nào thì provider đó bị disable (trừ `pollinations`/`llm7-io` scraped tự động enable). Real-key `k.length>20 && !k.includes('xxx') && !k.includes('change-me')` cho `hasRealKey` `api.ts:27`. **Đổi `.env` phải kill process cũ & restart** vì `config.ts:22` chỉ đọc lúc boot (`tsx watch` không watch `.env`):
- **Docker (mọi OS):** `docker compose restart gateway`
- **macOS/Linux:** `pkill -f "tsx watch"; lsof -ti:7373 | xargs kill -9; npm run dev:gateway`
- **Windows PowerShell:** `netstat -ano | findstr :7373` → `taskkill /PID <PID> /F` (hoặc `taskkill /F /IM node.exe`)
- **Windows CMD/Git Bash:** `netstat -ano | findstr :7373` → `taskkill /PID <PID> /F`

sau đó bấm **Sync Live Now** `POST /api/models/live/sync` để nạp `data/live-models.json`. Clone mới `data/` trống (`data/.gitkeep` only, `b930e6d` — `data/*.json` đã gitignored); chạy sync mới có cache. Xem bảng đầy đủ trong `docs/PROVIDERS.md:1`.

### Router

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `DEFAULT_MODEL` | `auto` | model khi client không truyền |
| `FALLBACK_TIERS` | `[[...]]` | JSON tiers freellms: `[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io"],["openrouter","kilo-code","pollinations"]]` |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | fails để open |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | — |

### Vector 1+2 — Audio / Responses / Anthropic / Semantic Cache / Compression / Cost Routing / Analytics (2026-09-08)

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `ANTHROPIC_API_KEYS` | _(trống)_ | Danh sách key Anthropic cho upstream `/v1/messages` (phân tách dấu phẩy, round-robin như các provider khác) |
| `SEMANTIC_CACHE_ENABLED` | `0` | Bật cache ngữ nghĩa cho `/v1/chat/completions` + `/v1/messages`. `1` bật, `0` tắt |
| `SEMANTIC_THRESHOLD` | `0.92` | Ngưỡng cosine similarity để cache hit (0.0–1.0, càng cao càng chặt). Tối ưu cho `cohere/embed-english-v3.0` |
| `CACHE_TTL_S` | `3600` | TTL (giây) cho cache completions (1 giờ). Xóa qua Redis TTL hoặc sweep in-memory |
| `EMBEDDING_MODEL` | `cohere/embed-english-v3.0` | Model embedding cho semantic cache. Mặc định Cohere; có thể đổi endpoint tương thích |
| `COMPRESSION_ENABLED` | `0` | Bật nén token (cắt history + minify tools, pattern 12-engine như OmniRoute) để giảm chi phí |
| `COST_ROUTING_ENABLED` | `0` | Bật routing theo chi phí — ưu tiên provider free rẻ nhất trước (hòa thì xét latency/verified) |
| `ANALYTICS_RETENTION_DAYS` | `30` | Số ngày giữ rollup analytics admin (theo dõi chi phí, tiết kiệm, billing per-key, `costByProvider`, `cacheHitRate`, `p95`) |

Các flag mặc định tắt (`0`) để tương thích ngược. Bật riêng lẻ qua `.env` và restart gateway (xem hướng dẫn kill/restart ở trên).

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
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
# Lịch sử
python scripts/sync-freellms.py        # fetch freellms.org -> data/*.json + models.yaml (disabled)
npm run sync:freellms -w apps-gateway  # alias
```

Gateway `GET /v1/models` đọc `data/live-models.json:1` (live 882) khi `?hasKey=1` với real keys, ngược lại `data/freellms-models-free.json:1` (316 rows), `GET /api/providers` trả `detailed[]` với `free_models`, `hasRealKey` (highlight xanh lá), `limit`, `verified`, pagination LOV 25/50 ở sticky bottom (debounce 400ms).

## UI Filters — hasKeyOnly + hide404/hidePayment/hideInvalid

`apps/web/src/pages/Models.tsx:32,86` 4 toggles trong **Filters** dropdown cạnh `Verified`: `hasKeyOnly` **mặc định tắt** (`localStorage hasKeyOnly:0`, `hasKeyOnly_migrated`), 3 `hide404`/`hidePayment`/`hideInvalid` mặc định bật. `Refresh` `handleRefresh` xóa `q`/`provider`/`verified`, reset `hasKeyOnly:false` + `hide*` true, không tự bật `hasKey`. `Check Live (n)` yêu cầu `qDebounced || providerDebounced` (tooltip khi chưa filter).

## Persisted health — 404/410 và usable 200

`data/model-health.json` lưu cả `404/410` **và** `usable 200` (`api.ts:222 POST /api/models/health/mark` lưu `status:"usable",http_status:200`). `GET /v1/models` `v1/models.ts:153` nếu `h.http_status==200` thì `live_status:"verified_free"` override `deprecated`. Frontend `Models.tsx:160,366` `isRowDisabled`/`isDisabledForHide` ưu tiên `(usage>0) || (live usable 200)` trước khi check `404/410`/`deprecated`/`isInvalidId`, nên `Check` per-row `GET /api/models/health?model=` → `POST /mark usable` sẽ giữ không đỏ sau reload. `GET /api/models/health/persisted` `api.ts:217` list, `DELETE` xóa.

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

`apps/web/src/main.tsx:40` — `display: flex; flexDirection: column; gap:10`: hàng 1 `justifyContent: space-between` trái logo + health + `30 providers • 316 free` / phải `VI/EN` + `Master` **input chỉnh sửa** (toggle password/text, tự điền từ `GET /api/bootstrap` khi placeholder/mismatch, `localStorage masterKey`); hàng 2 nav 5 tabs căn giữa `alignSelf: center`. Trước đây single row — hiện 2 hàng. Header **không còn read-only** từ `8f1b3b7`.

## Bootstrap — tự điền MASTER_KEY

`apps/gateway/src/app.ts:23` public `GET /api/bootstrap` (alias `/api/config/master`) trả `{masterKey}` để UI lần đầu tự bind. Tắt mặc định (`EXPOSE_BOOTSTRAP=0`, an toàn). Frontend `apps/web/src/main.tsx:34` fetch khi `localStorage masterKey` placeholder (`fgk-master-dev-key`/`change-me`/len<16) và re-bootstrap khi `401`. Bật local only bằng `EXPOSE_BOOTSTRAP=1`.

## Clone mới — data trống

`b930e6d` xóa `data/*.json` committed; `.gitignore:18` hiện `data/*.json` + `!data/.gitkeep`. `git clone` mới → `data/` trống; chạy `POST /api/models/live/sync` hoặc `npx tsx apps/gateway/src/jobs/sync-live-models.ts` với key thật để nạp cache live trước khi `?hasKey=1` có dữ liệu.

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

Migrate (Node >= 22, npm):

```bash
npm run db:generate
npm run db:migrate
npm run db:studio   # GUI
```

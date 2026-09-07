> **Tiếng Việt** | [🇬🇧 English](../en/ARCHITECTURE.md) | [Docs Index](../README.md)

# Kiến trúc (Architecture)

Tài liệu này mô tả kiến trúc chi tiết của `app-auto-llm-free` — gateway thống nhất cho LLM free (30 freellms + 13 alias = 43 ids; snapshot freellms 316 free, **live sync hiện tại là source of truth**: `data/live-models.json` 2185 total / 882 free / 853 hasKey qua `sync-live-models.ts`).

## 1. Tổng quan

```mermaid
flowchart LR
  Client -->|OpenAI SDK| Gateway
  Gateway --> Router
  Router --> PA[Provider Adapters]
  PA -->|fetch| Upstream
  Upstream --> PA
  PA --> Normalizer --> Gateway --> Client
  Gateway --> Dashboard
  Dashboard --> DB[(SQLite/Postgres)]
  Gateway --> Redis
  Gateway -.-> Scheduler[24h Verify + Live Sync]
  Scheduler -.-> PA
  PA -.-> LiveSync[sync-live-models.ts<br/>data/live-models.json]
  LiveSync -.-> Data[(data/*.json + models.yaml)]
  freellms.org -.x SyncDisabled[Freellms sync disabled<br/>không còn latest]
```

* **Gateway**: Hono app chạy trên Bun/Node/Cloudflare Workers (WinterCG). Multi-runtime, ultrafast RegExpRouter.
* **Router**: Chọn provider pool dựa trên `model`, alias (`auto`, `gpt-4`, `glm`, `qwen`, `code`, `embedding`, `kilo-auto`), header `x-router`, tier fallback 4-tier freellms, sanitize `gemini 3.6 flash`/`nvidia: nemotron` (`openai-compatible.ts:31`). Khi `live-models.json` tồn tại, `GET /v1/models?hasKey=1` và `GET /api/providers?hasKey=1` phục vụ từ live cache (hasRealKey) thay vì freellms snapshot.
* **Adapters**: Mỗi provider implement `Provider` interface. 43 ids (30 freellms NVIDIA 97, ModelScope 43, Cloudflare 35... + 13 alias) qua `createOpenAICompatibleProvider`, Gemini `gemini-3.6-flash` (`gemini.ts:5`), Pollinations scraped. `nvidia-nim auto: nvidia/nemotron-3-ultra-550b-a55b` (đã fix 410).
* **Dashboard**: Vite + React (recharts, i18n `lib/i18n.tsx` VI/EN), 5 routes `Dashboard→Providers→Models→Keys→Logs` (**header 2 hàng** `max-w-[1440px]` rộng hơn `lg:px-6`: hàng 1 trái `⚡ Free LLM Gateway` + `● online/offline` + `30 providers • 316 free`, phải `VI/EN` + **Master read-only** (masked + Show/Copy, tự sinh, luôn có admin) — không edit; hàng 2 nav `Dashboard→Providers→Models→Keys→Logs` căn giữa). `Dashboard` 4 cards + 3 charts + tokens, `Models` **filter bar 1 hàng**: search `q` + `provider` + `verified` + **Filters** dropdown (4 toggles `hasKey`/`hide404`/`Hide credits`/`Hide invalid ID`) + **top-right 3 nút** `Check Live`/`Sync Live`/`Refresh` (dời lên nhờ center rộng), **sticky bottom pagination**: `‹ Prev / Next ›` + `Page X/Y` + `LOV 25/50`, bảng có strikethrough `#dc2626` cho 404/410/invalid/payment, `Providers` pagination 25/50 + `hasKey` pill + highlight `hasRealKey`, `Keys` Generator (**collapsed** măc định) + CRUD `fgk-...`, `Logs` charts + SSE Live ON.
* **Data Layer**: `data/freellms-providers.json` (30, lịch sử), `data/freellms-models-free.json` (316, lịch sử), `models.yaml` (316), `data/verified-models.json` (live verify), `data/model-health.json` (persisted 404/410 strikethrough + localStorage `hide404_migrated`), `data/live-models.json` (live sync: 2185 total, 882 free, 853 hasKey — freeOnly lọc theo Permanent Free tier hoặc `:free` suffix hoặc freellms free list), `data/request-log.json` (1000 logs), `lib/paths.ts` resolve `data/` cho cả `cwd=root` và `cwd=apps/gateway`.
* **Scheduler**: `jobs/scheduler.ts` 24h (`SYNC_INTERVAL_MS`), vừa gọi `verifyFreeModels()` (so sánh freellms FREE vs live `/models`) vừa gọi `syncLiveModels({freeOnly:true})` để refresh live cache; `jobs/probe-models.ts` chat probe per-model (`/api/models/health` + persisted). `jobs/sync-live-models.ts` fetch `provider.models()` qua real keys (check `!xxx`/`change-me`, length >20) → `data/live-models.json`.
* **Token**: `lib/token-estimator.ts` char/4, `lib/request-log.ts` aggregation `allTimeTokens` + `tokensByProvider` cho Dashboard/Logs charts.
* **i18n**: `apps/web/src/lib/i18n.tsx` — `LangProvider` VI/EN, `localStorage lang` (`vi` default), `select VI/EN` trong header, translate nav + Models/Providers. Docs có `docs/vi/` và `docs/en/` với banner riêng, root `README.md` mặc định English + `README.vi.md` tiếng Việt (trước đây README mặc định là Vietnamese).
* **Rate Limit**: `middleware/rate-limit.ts` — list endpoints (`/v1/models`, `/api/providers`, `/api/models/health`) được 4x limit (`Math.max(rpmLimit*4, 200)`) + frontend debounce search `q` 400ms (Models/Providers) để tránh 429 khi gõ.

Tham khảo: `free-llm-gateway` (24+ providers) và `OmniRoute` (271 providers, 90 free).

## 2. Luồng request

```
1. POST /v1/chat/completions  {model, messages, stream, tools}
2. middleware/auth            -> verify `fgk-...` timing-safe, load scopes
3. middleware/rateLimit       -> Redis rolling window RPM/TPM check (list endpoints 4x/200, debounce 400ms frontend)
4. token-estimator            -> ước tính TPM pre-flight, reject nếu vượt
5. smart-router               -> resolve alias (auto/gpt-4/glm/qwen) -> provider pool ordered
                               filter deprecated nếu có verified data (verified=free) + persisted 404 skip (model-health.json)
6. for provider in pool:
     key = key-manager.getNext(provider)  # round-robin, skip rate-limited, hasRealKey check
     try: response = provider.chat(req, key) # fetch với proxy helper
     catch 429/timeout: quota-tracker.markRateLimited(key); continue
     catch 404/410: POST /api/models/health/mark -> persist strikethrough #dc2626 + localStorage hide404
     catch other: circuit-breaker.recordFail(provider); continue
     success: break
7. normalizer                 -> chuyển Gemini shape về OpenAI shape
8. SSE passthrough            -> if stream: proxy chunk-by-chunk, handle mid-stream error
9. logger + request_db        -> ghi latency, tokens, cost, provider đã dùng
10. return OpenAI JSON/SSE
```

## 3. Provider Interface

`apps/gateway/src/providers/base.ts:1`

```ts
export interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string | Part[] }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: Tool[];
  tool_choice?: string | object;
}

export interface Provider {
  id: string; // 'nvidia-nim' | 'groq' | 'google-gemini' | 'pollinations'
  type: 'openai-compatible' | 'gemini' | 'anthropic' | 'scraped';
  chat(req: ChatRequest, apiKey: string): Promise<Response>;
  models(apiKey?: string): Promise<ModelInfo[]>; // GET {baseUrl}/models -> live sync source
  health(apiKey: string): Promise<boolean>;
}
```

* `openai-compatible` (28/30): NVIDIA (`integrate.api.nvidia.com/v1`), Groq (`api.groq.com/openai/v1`), Cerebras, GitHub Models (`models.github.ai/inference`), OVH, Cohere (`/v2`), ModelScope, Chutes, SambaNova, SiliconFlow, Glhf, Mistral, LLM7, Agnes, Aion, Z AI (`open.bigmodel.cn/api/paas/v4`), DeepSeek, OpenRouter, Ollama Cloud, Nscale, Nebius, AI21… — chỉ cần `baseURL + Authorization`.
* `gemini`: Google (`generativelanguage.googleapis.com/v1beta`) — cần `format-translator` (OpenAI → Gemini contents).
* `scraped`: Pollinations (`text.pollinations.ai/openai`) — không cần key, tự map alias `auto` → `openai`.

Registry `apps/gateway/src/providers/registry.ts:1` liệt kê 43 ids (30 freellms slugs + 13 alias `mistral`/`gemini`/`nvidia`/`kilo-code`/`openrouter`), `providerMeta` chứa caps/tier/tier_type/noCard, alias map 15+ keys (`kilo-auto`, `gemini-3.6`...).

## 4. Router & Fallback

Học `smart_router.py` + OmniRoute 19 strategies, thực tế freellms tier:

| Strategy | Mô tả |
|----------|-------|
| `round-robin` | Mặc định, phân tán tải |
| `tiered` | 4-tier từ `.env.example:19` `FALLBACK_TIERS=[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io","hugging-face"],["openrouter","kilo-code","pollinations"]]` |
| `latency` | Chọn p50 thấp nhất (P3) |
| `alias` | `auto`→5 P0, `gpt-4`→5, `claude-3`→4, `glm`→3, `qwen`→4, `code`→4, `embedding`→3 (xem `registry.ts:42`) |
| `verified` | Nếu có `data/verified-models.json` + `data/model-health.json` (persisted 404/410), `GET /v1/models?verified=free` loại `deprecated` khỏi pool |
| `hasKey` | `?hasKey=1` chỉ hiện provider có real key (`!xxx`, length>20) — dùng live cache `data/live-models.json` khi có (2190 total) |

Fallback: Tiered fallback với circuit breaker (5 fails / 30s cooldown, `config.ts:30`). Mid-stream SSE error → emit `data: {"error": ...}\n\n` rồi close. Persisted `model-health.json` được `chat.ts:22` merge để skip `deprecated` ngay cả khi chưa `verify`.

## 5. Key Management & Security

* **Encryption at rest**: AES-256-GCM (WebCrypto), key từ `ENCRYPTION_KEY`. `key_encryptor.py` style.
* **Virtual keys**: prefix `fgk-`, hash SHA-256, scopes `{models, providers}`, `rpmLimit`, `tpdLimit`.
* **Key pool**: `GROQ_API_KEYS=gsk_xxx,gsk_yyy` → round-robin, skip `Retry-After`. `config.ts:32` hỗ trợ 30 providers freellms (kể cả `OVHCLOUD_API_KEYS` alias). Real key check: `k.length>20 && !k.includes('xxx')`.
* **Auth**: `hono/bearer-auth` + timing-safe compare, `admin`/`user`.

## 6. Rate Limiting & Quota

* **Redis rolling window**: RPM/RPD/TPM/TPD per virtual key + per provider key (freellms limits: NVIDIA 40 RPM shared, Groq 30/14.4K, Cerebras 15/1M TPD, Gemini 15/1.5K, OVH 2 anon, Agnes 30, OpenRouter 200/day, Kilo ~200/hr).
* **429 fix**: Frontend debounced search `q` 400ms (Models/Providers `qDebounced`), backend `middleware/rate-limit.ts:11` tăng limit cho list endpoints lên 4x (min 200) → `effectiveLimit = max(rpmLimit*4, 200)` cho `/v1/models`, `/api/providers`, `/api/models/health`.
* **Headers**: `x-ratelimit-remaining-*`, `retry-after` khi 429.
* **Token estimator**: `js-tiktoken` pre-flight. `quota-tracker.ts` (P3) sẽ dùng `models.yaml:1` `limit` field.

## 7. Data & Verification

| File | Nguồn | Nội dung |
|------|-------|----------|
| `data/freellms-providers.json` | freellms.org/providers (30) — **lịch sử, disabled** | `name, slug, tier, caps, noCard, free_models` |
| `data/freellms-models-free.json` | freellms.org/models (316 free) — **lịch sử, không còn latest** | `name, slug, context, score, limit, verified, modality` |
| `models.yaml` | `scripts/sync-freellms.py` (lịch sử) | 316 entries, `id: nvidia-nim/z-ai/glm-5.2`, `score`, `limit` |
| `data/live-models.json` | **`jobs/sync-live-models.ts` live (source of truth mới)** | `total:2185, providers, free_only:true, models[]` (882 free / 853 hasKey, lọc Permanent Free hoặc `:free` hoặc freellms list) |
| `data/verified-models.json` | `jobs/verify-free.ts` live probe | `status: verified_free / deprecated / unverified_no_key / error`, `last_verified` |
| `data/verified-summary.json` | `jobs/verify-free.ts` | Tổng hợp per-provider |
| `data/model-health.json` | `POST /api/models/health/mark` persisted 404/410 | `http_status:404/410, error, updated_at`, strikethrough `#dc2626`, disabled checkbox, `hide404` (mặc định checked, `hide404_migrated` localStorage) |

Luồng sync **mới** (live là source of truth): `jobs/sync-live-models.ts` fetch `provider.models(key)` qua real keys → `data/live-models.json` (2185 total, 882 free) → `GET /v1/models?hasKey=1` phục vụ live cache (2190 total incl alias), `GET /api/models/live` + `POST /api/models/live/sync {freeOnly:true}`. Freellms sync (`scripts/sync-freellms.py`) đã **disabled** (không còn latest). Scheduler gọi cả `verifyFreeModels` lẫn `syncLiveModels` mỗi 24h. Xem `docs/OPERATIONS.md:1`.

## 8. Database & Files

Drizzle ORM (`apps/gateway/src/db/schema.ts:1`):

```ts
users(id, email, password_hash, role)
virtual_keys(id, prefix, hash, user_id, scopes JSON, rpm_limit, tpd_limit)
provider_keys(id, provider, encrypted_key, status, last_checked_at)
requests(id, virtual_key_id, provider, model, prompt_tokens, completion_tokens, latency, cost, status, created_at)
providers_cache(provider, models JSON, synced_at)
```

* SQLite dev, Postgres prod, BRIN index. Runtime `data/virtual-keys.json` (hash), `data/request-log.json` (1000), `resolveDataPath` cho cả cwd.

## 9. Cấu trúc thư mục

```
.
├── apps/gateway/src/
│   ├── index.ts              # serve + startScheduler() (verify + live sync)
│   ├── app.ts                # Hono + secureHeaders + cors + auth + virtualKeyRateLimit (4x list)
│   ├── config.ts             # 30 providers keys + 4-tier fallback + SYNC_INTERVAL_MS
│   ├── lib/paths.ts          # resolveDataPath (fix 7 vs 316 bug)
│   ├── lib/key-manager.ts    # AES-GCM + round-robin + markRateLimited
│   ├── lib/quota-tracker.ts  # FREELLMS_LIMITS RPM/TPM
│   ├── lib/circuit-breaker.ts# 5/30s half-open
│   ├── lib/token-estimator.ts# char/4
│   ├── lib/virtual-keys.ts   # fgk- CRUD + hasScope
│   ├── lib/request-log.ts    # 1000 logs + tokens aggregation + SSE
│   ├── lib/otel.ts           # GenAI OTel
│   ├── lib/gemini-stream.ts  # Gemini SSE → OpenAI
│   ├── lib/i18n.tsx          # (web) VI/EN selector, localStorage lang
│   ├── providers/registry.ts # 43 ids, providerMeta, auto 15-tier (real key → public)
│   ├── jobs/verify-free.ts   # freellms vs live /models
│   ├── jobs/probe-models.ts  # chat probe per-model usable
│   ├── jobs/sync-live-models.ts # live fetch provider.models() -> data/live-models.json (freeOnly)
│   ├── jobs/scheduler.ts     # 24h (verify + syncLiveModels)
│   ├── routes/v1/models.ts   # live 2185/882 + freellms 316 + hasKey/q/page/limit/verified + pagination LOV 25/50
│   ├── routes/v1/chat.ts     # quota/breaker/verified/log + X-Verified
│   ├── middleware/rate-limit.ts # 4x limit cho list endpoints + debounce 400ms frontend
│   └── routes/api.ts         # /providers (hasKey,q,pagination 25/50) /providers/health live, /models/health, /models/health/persisted, /models/live/sync, /models/live, /verify, /keys, /logs/stream, /stats
├── apps/web/src/
│   ├── main.tsx              # **Header 2 hàng**: row1 Master phải + VI/EN, row2 nav centered; sticky nav Dashboard→Providers→Models→Keys→Logs
│   ├── pages/Dashboard.tsx   # 4 cards + 3 charts + tokens
│   ├── pages/Providers.tsx   # **hasRealKey highlight** #f0fdf4 + border #16a34a + ● has key + Keys ✓ real + Get Key xanh; filter q debounce 400ms + hasKey pill + pagination sticky bottom 25/50
│   ├── pages/Models.tsx      # **Top filter**: q + verified + pill hasKey/hide404; **hàng 2**: Check Live (primary + badge) - Sync Live Now (green freeOnly) - Refresh centered; **sticky bottom**: Page X/Y + LOV 25/50; strikethrough #dc2626 + hide404 default checked
│   ├── pages/Keys.tsx        # Key Generator + CRUD + Quick Test
│   ├── pages/Logs.tsx        # charts + **Live ON (SSE + 2s poll)** — đã bỏ Auto sync 5s duplicate
│   ├── lib/getKeyUrls.ts     # 30 console URLs
│   ├── lib/i18n.tsx          # VI/EN dict, LangProvider
│   └── index.css             # unified card/button/table (nav style)
├── data/*.json               # freellms (lịch sử) + live-models.json + verified + model-health + benchmark
├── models.yaml               # 316 free (freellms snapshot)
├── scripts/sync-freellms.py (disabled, không còn latest), sync-live-models.ts, benchmark.ts, rotate-keys.ts
└── .github/workflows/sync-freellms.yml # daily 02:00 UTC (hiện live sync thay)
```

## 10. Observability & Deploy

* `pino` pretty dev / JSON prod, OTel GenAI (`lib/otel.ts`), `secureHeaders`, `bodyLimit` 10MB.
* `GET /api/stats` — `allTimeTokens`, `tokensByProvider`, `avgTokens` + `GET /api/verify/summary` + `GET /api/models/health` chat probe + `GET /api/models/live` live cache.
* Docker prod non-root + HEALTHCHECK, Wrangler `wrangler.jsonc` Cloudflare. Xem `docs/DEPLOYMENT.md:1`.
* Docs: `docs/vi/` và `docs/en/` với banner riêng, root `README.md` mặc định English, `README.vi.md` Vietnamese, ngôn ngữ UI chọn ở header và persist `localStorage lang`.


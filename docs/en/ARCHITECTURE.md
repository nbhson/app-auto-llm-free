> **English** | [🇻🇳 Tiếng Việt](../vi/ARCHITECTURE.md) | [Docs Index](../README.md)

# Architecture

This document describes the detailed architecture of `app-auto-llm-free` — a unified gateway for free LLMs (30 freellms + 13 aliases = 43 IDs; freellms snapshot 316 free, **live sync is now source of truth**: `data/live-models.json` 2185 total / 882 free / 853 hasKey via `sync-live-models.ts`).

## 1. Overview

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
  freellms.org -.x SyncDisabled[Freellms sync disabled<br/>not latest]
```

* **Gateway**: Hono app running on Bun/Node/Cloudflare Workers (WinterCG). Multi-runtime, ultrafast RegExpRouter.
* **Router**: Selects the provider pool based on `model`, alias (`auto`, `gpt-4`, `glm`, `qwen`, `code`, `embedding`, `kilo-auto`), `x-router` header, 4-tier freellms fallback, and sanitizes `gemini 3.6 flash`/`nvidia: nemotron` (`openai-compatible.ts:31`). When `live-models.json` exists, `GET /v1/models?hasKey=1` and `GET /api/providers?hasKey=1` serve from the live cache (hasRealKey) instead of the freellms snapshot.
* **Adapters**: Each provider implements the `Provider` interface. 43 IDs (30 freellms — NVIDIA 97, ModelScope 43, Cloudflare 35... + 13 aliases) via `createOpenAICompatibleProvider`, Gemini `gemini-3.6-flash` (`gemini.ts:5`), and scraped Pollinations. `nvidia-nim auto: nvidia/nemotron-3-ultra-550b-a55b` (410 fix applied).
* **Dashboard**: Vite + React (recharts, i18n `lib/i18n.tsx` VI/EN), 5 routes `Dashboard→Providers→Models→Keys→Logs` (**2-row header** `max-w-[1440px]` wider `lg:px-6`: row 1 left `⚡ Free LLM Gateway` + `● online/offline` + `30 providers • 316 free`, right `VI/EN` + **Master read-only** (masked + Show/Copy, auto-generated, always admin) — no edit; row 2 centered nav `Dashboard→Providers→Models→Keys→Logs` via `alignSelf: center`). `Dashboard` with 4 cards + 3 charts + tokens, `Models` **single filter row**: search `q` (400ms) + `provider` + `verified` + **Filters** dropdown (next to Verified, 4 toggles `hasKey`/`hide404`/`Hide credits`/`Hide invalid ID`) + **top-right 3 buttons** `Check Live (n)` — `Sync Live Now` — `Refresh` (moved up from centered second row, thanks to wider center), **sticky bottom pagination**: `‹ Prev / Next ›` + `Page X/Y` + `LOV 25/50`, table with strikethrough `#dc2626` for 404/410/invalid/payment, `Keys` Generator (**collapsed by default**) + CRUD `fgk-...`, `Logs` with charts + SSE Live ON.
* **Data Layer**: `data/freellms-providers.json` (30, historical), `data/freellms-models-free.json` (316, historical), `models.yaml` (316), `data/verified-models.json` (live verify), `data/model-health.json` (persisted 404/410 strikethrough + localStorage `hide404_migrated`), `data/live-models.json` (live sync: 2185 total, 882 free, 853 hasKey — freeOnly filtered by Permanent Free tier or `:free` suffix or freellms free list), `data/request-log.json` (1000 logs), `lib/paths.ts` resolves `data/` for both `cwd=root` and `cwd=apps/gateway`.
* **Scheduler**: `jobs/scheduler.ts` runs every 24h (`SYNC_INTERVAL_MS`), calling both `verifyFreeModels()` (freellms FREE vs live `/models`) and `syncLiveModels({freeOnly:true})` to refresh the live cache; `jobs/probe-models.ts` per-model chat probe (`/api/models/health` + persisted). `jobs/sync-live-models.ts` fetches `provider.models()` via real keys (check `!xxx`/`change-me`, length >20) → `data/live-models.json`.
* **Token**: `lib/token-estimator.ts` uses char/4, `lib/request-log.ts` aggregates `allTimeTokens` + `tokensByProvider` for Dashboard/Logs charts.
* **i18n**: `apps/web/src/lib/i18n.tsx` — `LangProvider` VI/EN, `localStorage lang` (`vi` default), `VI/EN` select in header, translates nav + Models/Providers. Docs have `docs/vi/` and `docs/en/` with own banners, root `README.md` default English + `README.vi.md` Vietnamese (previously default was Vietnamese).
* **Rate Limit**: `middleware/rate-limit.ts` — list endpoints (`/v1/models`, `/api/providers`, `/api/models/health`) get 4x limit (`Math.max(rpmLimit*4, 200)`) + frontend debounced search `q` 400ms (Models/Providers `qDebounced`) to prevent 429 while typing.

References: `free-llm-gateway` (24+ providers) and `OmniRoute` (271 providers, 90 free).

## 2. Request Flow

```
1. POST /v1/chat/completions  {model, messages, stream, tools}
2. middleware/auth            -> verify `fgk-...` timing-safe, load scopes
3. middleware/rateLimit       -> Redis rolling window RPM/TPM check (list endpoints 4x/200, frontend debounce 400ms)
4. token-estimator            -> estimate TPM pre-flight, reject if exceeded
5. smart-router               -> resolve alias (auto/gpt-4/glm/qwen) -> ordered provider pool
                                 filter deprecated if verified data exists (verified=free) + persisted 404 skip (model-health.json)
6. for provider in pool:
      key = key-manager.getNext(provider)  # round-robin, skip rate-limited, hasRealKey check
      try: response = provider.chat(req, key) # fetch with proxy helper
      catch 404/410: POST /api/models/health/mark -> persist strikethrough #dc2626 + localStorage hide404
      catch 429/timeout: quota-tracker.markRateLimited(key); continue
      catch other: circuit-breaker.recordFail(provider); continue
      success: break
7. normalizer                 -> convert Gemini shape to OpenAI shape
8. SSE passthrough            -> if stream: proxy chunk-by-chunk, handle mid-stream error
9. logger + request_db        -> record latency, tokens, cost, provider used
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

* `openai-compatible` (28/30): NVIDIA (`integrate.api.nvidia.com/v1`), Groq (`api.groq.com/openai/v1`), Cerebras, GitHub Models (`models.github.ai/inference`), OVH, Cohere (`/v2`), ModelScope, Chutes, SambaNova, SiliconFlow, Glhf, Mistral, LLM7, Agnes, Aion, Z AI (`open.bigmodel.cn/api/paas/v4`), DeepSeek, OpenRouter, Ollama Cloud, Nscale, Nebius, AI21… — only `baseURL + Authorization` required.
* `gemini`: Google (`generativelanguage.googleapis.com/v1beta`) — requires `format-translator` (OpenAI → Gemini contents).
* `scraped`: Pollinations (`text.pollinations.ai/openai`) — no key required, auto-maps alias `auto` → `openai`.

Registry `apps/gateway/src/providers/registry.ts:1` lists 43 IDs (30 freellms slugs + 13 aliases `mistral`/`gemini`/`nvidia`/`kilo-code`/`openrouter`), `providerMeta` contains caps/tier/tier_type/noCard, and the alias map has 15+ keys (`kilo-auto`, `gemini-3.6`...).

## 4. Router & Fallback

Based on `smart_router.py` + OmniRoute's 19 strategies; actual freellms tiers:

| Strategy | Description |
|----------|-------------|
| `round-robin` | Default, distributes load |
| `tiered` | 4-tier from `.env.example:19` `FALLBACK_TIERS=[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io","hugging-face"],["openrouter","kilo-code","pollinations"]]` |
| `latency` | Picks lowest p50 (P3) |
| `alias` | `auto`→5 P0, `gpt-4`→5, `claude-3`→4, `glm`→3, `qwen`→4, `code`→4, `embedding`→3 (see `registry.ts:42`) |
| `verified` | If `data/verified-models.json` + `data/model-health.json` (persisted 404/410) exist, `GET /v1/models?verified=free` excludes `deprecated` from the pool |
| `hasKey` | `?hasKey=1` shows only providers with real keys (`!xxx`, length>20) — uses live cache `data/live-models.json` when available (2190 total) |

Fallback: Tiered fallback with circuit breaker (5 failures / 30s cooldown, `config.ts:30`). Mid-stream SSE error → emits `data: {"error": ...}\n\n` then closes. Persisted `model-health.json` is merged in `chat.ts:22` to skip `deprecated` even before `verify` runs.

## 5. Key Management & Security

* **Encryption at rest**: AES-256-GCM (WebCrypto), key derived from `ENCRYPTION_KEY` — **auto-generated** 64 hex if missing/placeholder (`config.ts:32`), persisted to `.env` or `data/.gateway-keys.json`, never used as API key.
* **Master key (single-key)**: `MASTER_KEY=fgk-master-...` — **single API key** for `/v1/*` + `/api/*` admin, auto-generated if missing and seeds `vk-master` (`lib/virtual-keys.ts:116`). Scoped `fgk-...` keys are optional per-app.
* **Virtual keys**: `fgk-` prefix, SHA-256 hash, scopes `{models, providers}`, `rpmLimit`, `tpdLimit`.
* **Key pool**: `GROQ_API_KEYS=gsk_xxx,gsk_yyy` → round-robin, skips `Retry-After`. `config.ts:32` supports 30 freellms providers (including `OVHCLOUD_API_KEYS` alias). Real key check: `k.length>20 && !k.includes('xxx')`.
* **Auth**: `hono/bearer-auth` + timing-safe compare, `admin`/`user` roles.

## 6. Rate Limiting & Quota

* **Redis rolling window**: RPM/RPD/TPM/TPD per virtual key + per provider key (freellms limits: NVIDIA 40 RPM shared, Groq 30/14.4K, Cerebras 15/1M TPD, Gemini 15/1.5K, OVH 2 anon, Agnes 30, OpenRouter 200/day, Kilo ~200/hr).
* **429 fix**: Frontend debounced search `q` 400ms (Models/Providers `qDebounced`), backend `middleware/rate-limit.ts:11` increases limit for list endpoints to 4x (min 200) → `effectiveLimit = max(rpmLimit*4, 200)` for `/v1/models`, `/api/providers`, `/api/models/health`.
* **Headers**: `x-ratelimit-remaining-*`, `retry-after` on 429.
* **Token estimator**: `js-tiktoken` pre-flight. `quota-tracker.ts` (P3) will use the `limit` field from `models.yaml:1`.

## 7. Data & Verification

| File | Source | Contents |
|------|--------|----------|
| `data/freellms-providers.json` | freellms.org/providers (30) — **historical, disabled** | `name, slug, tier, caps, noCard, free_models` |
| `data/freellms-models-free.json` | freellms.org/models (316 free) — **historical, not latest** | `name, slug, context, score, limit, verified, modality` |
| `models.yaml` | `scripts/sync-freellms.py` (historical) | 316 entries, `id: nvidia-nim/z-ai/glm-5.2`, `score`, `limit` |
| `data/live-models.json` | **`jobs/sync-live-models.ts` live (new source of truth)** | `total:2185, providers, free_only:true, models[]` (882 free / 853 hasKey, filtered by Permanent Free tier or `:free` suffix or freellms free list) |
| `data/verified-models.json` | `jobs/verify-free.ts` live probe | `status: verified_free / deprecated / unverified_no_key / error`, `last_verified` |
| `data/verified-summary.json` | `jobs/verify-free.ts` | Per-provider summary |
| `data/model-health.json` | `POST /api/models/health/mark` persisted 404/410 | `http_status:404/410, error, updated_at`, strikethrough `#dc2626`, disabled checkbox, `hide404` default checked (`hide404_migrated` localStorage) |

Sync flow **new** (live is source of truth): `jobs/sync-live-models.ts` fetches `provider.models(key)` via real keys → `data/live-models.json` (2185 total, 882 free) → `GET /v1/models?hasKey=1` serves live cache (2190 total incl alias), `GET /api/models/live` + `POST /api/models/live/sync {freeOnly:true}`. Freellms sync (`scripts/sync-freellms.py`) is **disabled** (not latest). Scheduler calls both `verifyFreeModels` and `syncLiveModels` every 24h. See `docs/OPERATIONS.md:1`.

## 8. Database & Files

Drizzle ORM (`apps/gateway/src/db/schema.ts:1`):

```ts
users(id, email, password_hash, role)
virtual_keys(id, prefix, hash, user_id, scopes JSON, rpm_limit, tpd_limit)
provider_keys(id, provider, encrypted_key, status, last_checked_at)
requests(id, virtual_key_id, provider, model, prompt_tokens, completion_tokens, latency, cost, status, created_at)
providers_cache(provider, models JSON, synced_at)
```

* SQLite for dev, Postgres for prod, BRIN index. Runtime `data/virtual-keys.json` (hash), `data/request-log.json` (1000), `resolveDataPath` for both cwd cases.

## 9. Directory Structure

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
│   ├── middleware/rate-limit.ts # 4x limit for list endpoints + frontend debounce 400ms
│   └── routes/api.ts         # /providers (hasKey,q,pagination 25/50) /providers/health live, /models/health, /models/health/persisted, /models/live/sync, /models/live, /verify, /keys, /logs/stream, /stats
├── apps/web/src/
│   ├── main.tsx              # **2-row header**: row1 Master right + VI/EN, row2 nav centered; sticky nav Dashboard→Providers→Models→Keys→Logs
│   ├── pages/Dashboard.tsx   # 4 cards + 3 charts + tokens
│   ├── pages/Providers.tsx   # **hasRealKey highlight** #f0fdf4 + border #16a34a + ● has key + Keys ✓ real + Get Key green; filter q debounce 400ms + hasKey pill + pagination sticky bottom 25/50
│   ├── pages/Models.tsx      # **Top filter**: q + verified + pill hasKey/hide404; **row 2**: Check Live (primary + badge) - Sync Live Now (green freeOnly) - Refresh centered; **sticky bottom**: Page X/Y + LOV 25/50; strikethrough #dc2626 + hide404 default checked
│   ├── pages/Keys.tsx        # Key Generator + CRUD + Quick Test
│   ├── pages/Logs.tsx        # charts + **Live ON (SSE + 2s poll)** — duplicate Auto sync 5s removed
│   ├── lib/getKeyUrls.ts     # 30 console URLs
│   ├── lib/i18n.tsx          # VI/EN dict, LangProvider
│   └── index.css             # unified card/button/table (nav style)
├── data/*.json               # freellms (historical) + live-models.json + verified + model-health + benchmark
├── models.yaml               # 316 free (freellms snapshot)
├── scripts/sync-freellms.py (disabled, not latest), sync-live-models.ts, benchmark.ts, rotate-keys.ts
└── .github/workflows/sync-freellms.yml # daily 02:00 UTC (now live sync replaces)
```

## 10. Observability & Deploy

* `pino` pretty in dev / JSON in prod, GenAI OTel (`lib/otel.ts`), `secureHeaders`, `bodyLimit` 10MB.
* `GET /api/stats` — `allTimeTokens`, `tokensByProvider`, `avgTokens` + `GET /api/verify/summary` + `GET /api/models/health` chat probe + `GET /api/models/live` live cache.
* Docker prod non-root + HEALTHCHECK, Wrangler `wrangler.jsonc` for Cloudflare. See `docs/DEPLOYMENT.md:1`.
* Docs: `docs/vi/` and `docs/en/` with own banners, root `README.md` default English, `README.vi.md` Vietnamese, UI language selected in header and persisted via `localStorage lang`.


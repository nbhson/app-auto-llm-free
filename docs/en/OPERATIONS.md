> **English** | [🇻🇳 Tiếng Việt](../vi/OPERATIONS.md) | [Docs Index](../README.md)

# Operations & Free Tier Verification (24h Sync — Live is Source of Truth)

## Problem: freellms.org May Be Outdated (now disabled)

`data/freellms-models-free.json` (316 free) is a snapshot from 2026-09-06. Providers may have already withdrawn their free tier (e.g. Groq 16/23 paid, Ollama Cloud 5/8 paid, OpenRouter 28/45 paid in the scan). **Freellms sync is now disabled** (not latest) — live provider APIs are the new source of truth.

## Solution: 2-Layer Sync (historical freellms + live current)

### Layer 1 — Freellms Sync (Historical, disabled)

```bash
python scripts/sync-freellms.py
# Fetch https://freellms.org/providers + /models -> data/*.json + models.yaml
# Previously ran every 24h via GitHub Actions at 02:00 UTC — NOW DISABLED, not latest
```

Files (historical):
- `data/freellms-providers.json` — 30 providers, caps/tier
- `data/freellms-models-free.json` — 316 free, includes `score/limit/verified`
- `models.yaml` — 316 entries for the gateway (snapshot)

### Layer 2 — Live Verify (Is It Still Actually Free?) + Live Sync (New Source of Truth)

**A. Verify free** `apps/gateway/src/jobs/verify-free.ts` compares **freellms FREE** vs **live /models** from the provider.

**Logic:**

```
for each provider in registry (30):
  keys = config.providerKeys[provider] // from .env
  if !keys && provider not in [pollinations, llm7-io]:
     mark all its models -> unverified_no_key
     => API key configuration is needed to verify
  else:
     live = await provider.models(keys[0]) // GET {baseUrl}/models
     for each freellms model in that provider:
        found = live contains id or short name
        status = found ? verified_free : deprecated
```

**Statuses (`status`):**

| Status | Meaning | Action |
|--------|---------|--------|
| `verified_free` | Provider returns the model and it is still free | Use normally |
| `deprecated` | Freellms says free but the live list no longer includes it → may have been withdrawn or renamed | Flag as deprecated; gateway will skip it in fallback if `?verified=free` |
| `unverified_no_key` | No API key configured, so probing is not possible | Warning in `/api/providers` -> `no-key`; add a key to `.env` |
| `error` | Provider unreachable / 429 | Retry later |
| `unverified_no_data` | Verify has never been run | Show freellms data with an unverified badge |

**Output:**

- `data/verified-models.json` — 316 detailed rows (`live_free`, `last_verified`, `error`)
- `data/verified-summary.json` — aggregated summary (`verified_free`, `deprecated`, `unverified_no_key`)

**B. Live sync (new source of truth)** `apps/gateway/src/jobs/sync-live-models.ts` fetches **live provider.models()** via real keys (`hasRealKey: k.length>20 && !k.includes('xxx')`) → `data/live-models.json`.

**freeOnly logic (default true):**

```
freeOnly = true (default)
for each provider with hasRealKey or public:
  live = await provider.models(key) // 2185 total fetched
  if freeOnly:
    if provider tier_type === permanent: keep all (all live are free)
    else if id includes ":free" or "(free)": keep
    else if in freellms free set: keep
    else skip (quota paid)
  -> filtered: 882 free, 853 hasKey
save to data/live-models.json { total, providers, free_only, total_fetched, models[] }
```

- `data/live-models.json` — `total:2185, free_only:true, total_fetched, providers, models[]` (882 free / 853 hasKey, alias adds 2190 total when served)
- `POST /api/models/live/sync {freeOnly:true}` — trigger sync (UI button **Sync Live Now** only pulls freeOnly)
- `GET /api/models/live` — get cache
- `GET /v1/models?hasKey=1` — when live cache exists serves **live 2190 total** instead of freellms 324
- `GET /api/providers?hasKey=1` — filter real keys, highlight green
  - **Models UI**: 4 toggles in Filters dropdown `hasKey` (default OFF `hasKeyOnly:0` + `hasKeyOnly_migrated`) + `hide404`/`hidePayment`/`hideInvalid` (default ON, `hide404_migrated`), strikethrough `line-through #dc2626` + disabled checkbox, persisted `data/model-health.json` now stores both `404/410` and `200 usable` (usable overrides 404 so reload stays non-red, `v1/models.ts:153` + `isRowDisabled`), hidden when hide toggles checked. **Refresh** (manual, no auto on reload, **initial fetch if no cache so not empty**) loads `v1/models` + `GET /api/sync/status` + `logs` (env-based `hasKeyOnly` preserved, usage cached `modelsCache`/`modelsUsageCache`, does not clear `masterKey`/logs/totals) and shows `★ NEW`. `Check Live` requires filter `q` or `provider` (tooltip otherwise).
  - **Sync Live Now** on both `/providers` and `/models` (same `POST /api/models/live/sync {freeOnly:true}` `Providers.tsx`/`Models.tsx`) only pulls free models — filtered by Permanent Free tier or `:free` suffix or freellms free list, writes `data/live-models.json`, then `POST /api/verify`. **Manual Refresh** (not auto) loads Providers from env `providerKeys` (`GET /api/providers?hasKey=1`, cached `providersCache`/`providersSyncCache`) and Usage highlights latest provider. Changing `.env` keys **requires restarting the gateway** `config.ts:22` (`docker compose restart gateway` or `pkill -f "tsx watch"; npm run dev:gateway`) to reload `hasRealKey`, then press **Refresh** on each page to see newest.

**Rate limit fix**: Frontend debounces `q` 400ms (Models/Providers), backend `middleware/rate-limit.ts` increases limit for list endpoints to 4x (min 200) to avoid 429 while typing/pagination.

## Automatic Scheduler (24h — verify + live sync + **boot-sync on `.env` update, no auto UI sync**)

`apps/gateway/src/jobs/scheduler.ts` + `jobs/boot-sync.ts` run inside the gateway:

- On startup (**boot-sync** `boot-sync.ts:76 runBootSync()`): compare current `config.providerKeys` vs `data/.provider-fingerprint.json` (`hasKey` `false→true`); if **new providers** (`newlyAdded`) exist → `syncLiveModels({freeOnly:false})` + `verifyFreeModels()` after ~3s, persist `addedAt`/`lastAdded`/`lastAddedAt`/`bootSync`/`liveSync`, reset model-store cache. If no new provider but `verified-models.json` stale (> `SYNC_INTERVAL_MS`) → fallback verify. **Sau khi update `.env` + restart gateway**: boot-sync tự chạy 1 lần; UI **Providers / Models / Usage không auto-sync khi reload** — nhấn **Refresh** trên từng page để load mới nhất (Providers: env-based, Usage: latest provider violet `★ NEW`, đều cached). `Sync Live` vẫn cần bấm thủ công nếu muốn force.
- Then `setInterval` every 24h → `verifyFreeModels()` + `saveVerifyReport()` + `syncLiveModels({freeOnly:true})`

Configuration:

```env
SYNC_INTERVAL_MS=86400000
DISABLE_SCHEDULER=0   # set to 1 to disable
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/models?hasKey=1` | **Live source of truth** when cache exists (2190 total) — `q` 400ms debounce, `page`/`limit` LOV 25/50 at sticky bottom, `provider` filter |
| `GET` | `/v1/models?verified=free` | Return only `verified_free` models (316 vs 7 bug fix `lib/paths.ts`) — freellms snapshot |
| `GET` | `/v1/models?verified=deprecated` | Only deprecated (including persisted 404/410) |
| `GET` | `/v1/models?verified=unverified` | Only unverified |
| `GET` | `/v1/models?provider=nvidia-nim&hasKey=1` | Filter by provider + hasKey (real keys) |
| `GET` | `/v1/models?q=gemma&page=1&limit=25` | Search + pagination LOV 25/50 (sticky bottom, 400ms debounce) |
| `GET` | `/api/providers?page=&limit=&q=&hasKey=` | `detailed[]` with `free_models`, `keys`, `hasRealKey`, `isNewest`/`addedAt`, `Get Key` URL, `status` + `sync.lastAdded` — pagination 25/50 sticky bottom, `q` 400ms debounce, **manual Refresh per-page** (env-based, cached `providersCache`, no auto on reload) |
| `GET` | `/api/providers/health` | Live ping of 51 providers in 5s |
| `GET` | `/api/sync/status` | **New 1.2.0**: fingerprint (`providers` `hasKey`/`addedAt`, `lastAdded`, `bootSync`, `liveModels`, `newestProviders`) — dùng cho **manual Refresh** highlight newest (Providers: env-based, Usage: latest provider) — cached |
| `POST` | `/api/sync/boot` | **New 1.2.0**: manual trigger `runBootSync({force})` |
| `POST` | `/api/models/live/sync` | Sync live `{freeOnly:true}` → `data/live-models.json` (2185/882) |
| `GET` | `/api/models/live` | Get live cache |
| `GET` | `/api/models/health?model=` | Probe 1 model with chat `Hi` 5 tokens 8s → `usable/unusable/no-key/410 Gone` |
| `GET` | `/api/models/health?provider=&limit=` | Bulk probe `limit` models (summary) |
| `GET` | `/api/models/health/persisted` | Persisted health (`data/model-health.json`) — `404/410` strikethrough + `200 usable` keeps non-red after reload, `hide404`/others default `hasKey OFF` |
| `POST` | `/api/models/health/mark` | Mark health `{ids:[],http_status:404|200,error,status:"usable"|"unusable",latency_ms}` — `404` creates deprecated strikethrough, `200 usable` overrides previous `404` and `v1/models.ts:153` flips to `verified_free` + frontend `isRowDisabled` clears red |
| `GET` | `/api/verify` | Full report `verified-models.json` |
| `GET` | `/api/verify/summary` | Quick summary |
| `POST` | `/api/verify` | Trigger immediate verify (body `{dryRun: false}`), scheduler also syncs live |
| `GET` | `/api/stats` | `allTimeTokens`, `tokensByProvider`, `avgTokens`, `free_models:316`, `breakers` |
| `GET` | `/api/logs` | Paginated logs |
| `GET` | `/api/logs/stream` | SSE live logs — **Live ON (SSE + 2s poll)**, duplicate Auto sync 5s removed |
| `GET` | `/api/models/sync` | Freellms sync info (historical, disabled) |

Examples:

```bash
# Live source of truth
curl "http://localhost:7373/v1/models?hasKey=1&limit=25" -H "Authorization: Bearer fgk-xxx" | jq '.total, .pagination'
curl "http://localhost:7373/api/models/live" -H "Authorization: Bearer fgk-master-xxx" | jq
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer fgk-master-xxx" -d '{"freeOnly":true}' | jq '.total, .free_only'
curl "http://localhost:7373/api/providers?hasKey=1" -H "Authorization: Bearer fgk-master-xxx" | jq '.detailed[].hasRealKey'

# Freellms snapshot
curl http://localhost:7373/v1/models?verified=free -H "Authorization: Bearer fgk-xxx" | jq '.total'
curl http://localhost:7373/api/verify/summary -H "Authorization: Bearer fgk-master-xxx" | jq
curl -X POST http://localhost:7373/api/verify -H "Authorization: Bearer fgk-master-xxx" -d '{"dryRun":false}' | jq '.total_verified_free'
```

## CLI

```bash
# Dry-run (no key needed, uses freellms as live source)
npm run verify:free:dry -w apps-gateway

# Live (requires .env keys)
npm run verify:free -w apps-gateway
# or
npx tsx apps/gateway/src/jobs/verify-free.ts --dry-run
npx tsx apps/gateway/src/jobs/sync-live-models.ts # live sync freeOnly
```

## GitHub Actions (daily 02:00 UTC)

`.github/workflows/sync-freellms.yml` runs (historical):

1. `python scripts/sync-freellms.py` → updates `data/*` + `models.yaml` (now disabled)
2. `tsx verify-free.ts --dry-run` (or live if secrets `GROQ_API_KEYS` etc. are present)
3. Commit if changed → push to `main`

Currently recommended: add secrets `GROQ_API_KEYS`, `CEREBRAS_API_KEYS`, `NVIDIA_API_KEYS`, `GEMINI_API_KEYS`… so `jobs/sync-live-models.ts` runs live instead of dry-run. Freellms cron is kept as backup but no longer the main source.

## Operational Recommendations

- **Dev**: live data via `POST /api/models/live/sync` with 1–2 real keys or freellms snapshot is sufficient; no full verify needed (dry-run <1s)
- **Prod**: configure at least 5 P0 keys (NVIDIA, Groq, Cerebras, Gemini, GitHub) for live sync of 882 free (853 hasKey) every 24h; scheduler auto-calls both verify and syncLiveModels. Remaining providers will stay `unverified_no_key` but still serve with a warning
  - **Dashboard**:
    - `/models`: single filter row `q` + `provider` + `verified` + **Filters** dropdown (4 toggles: `hasKey` default OFF + `hide404`/`hidePayment`/`hideInvalid` default ON) + top-right 3 buttons `Check Live (n)` — `Sync Live Now` — **Manual Refresh** (env-based `hasKey` preserved, cached `modelsCache`/`modelsUsageCache`, preserves `masterKey`/logs/totals); sticky bottom pagination `Page X/Y` + `LOV 25/50`; table `isRowDisabled` prioritizes `live usable 200`/`usage>0` over `deprecated`, per-row `Check` persists `200 usable` to `data/model-health.json` so reload stays non-red; `hide*` hides
    - `/providers`: filter `q` 400ms debounce + pill `hasKey` (default OFF) + `hasRealKey` green highlight; sticky bottom `LOV 25/50`; **Manual Refresh** (env-based, cached `providersCache`/`providersSyncCache`, initial fetch if no cache so not empty) + **Sync Live Now** same endpoint as Models, writes `data/live-models.json`
     - `/chat`: 6 allowed models only (`free-llm-gateway/auto`, `kilo-code/kilo-auto/free`, `kilo-code/auto`, `openrouter/auto`, `kiraai/kira-auto`, `agnes-ai/agnes-2.5-flash`), strict selector, **robust streaming 1.5.1** — `extractDelta` handles `content`/`text`/`output_text` + `reasoning_content`/`reasoning`/`thinking` + array `[{text}]` + top-level, skips `:` ping/`event:`, buffers split JSON, `reasoningFull` fallback (fixes empty refactor when model only returns thinking, e.g. `tryLoadPersistedFallback` 88s case), `streamError` + leftover `data:` flush + **non-stream fallback 1×** (`stream:false`) + default `maxTokens 4096` (was 1024) to avoid `finish_reason:length` empty, markdown/code-block with copy, auto-scroll, right context-window with **breakdown clickable → scroll to message** (`highlightedId` ring), upload image/`.md`/`.txt` (50k), paste/drag, system prompt/temperature/maxTokens/stream, Refresh clears session, cache preserved
   - `/logs` + `/usage`: `logsCache`/`logsStatsCache`/`usage*Cache` cached, **Manual Refresh** per-page (Usage: latest provider highlight, env-based providers), **Live ON** SSE manual toggle (no auto), duplicate `Auto sync 5s` removed
   - Rate limit for list endpoints increased to 4x (200) to prevent 429 while typing/pagination

## What Happens When a Model Is Deprecated?

The gateway will:
- Still keep it in `GET /v1/models` but with `live_status: deprecated` + `persisted_404: true` + strikethrough (disabled `isRowDisabled`)
- If `?verified=free`, exclude deprecated from the list (so clients only see tiers that are still actually free)
- `POST /api/models/health/mark` persists `404/410` (`unusable`) and also `200 usable` (`usable` overrides 404, `v1/models.ts:153` flips to `verified_free`, frontend `isRowDisabled` clears red, survives reload) to `data/model-health.json` + `localStorage hide404`/`modelHealthUsable`, router will skip deprecated entries in `getProvidersForRequest` if verified data exists
- Per-row `Check` `GET /api/models/health?model=` → `POST /mark {status:"usable",http_status:200}` keeps `llm7-io/codestral-latest` non-red after reload even though `verified-models.json` said deprecated
- `hide404`/`hidePayment`/`hideInvalid` default ON, `hasKeyOnly` default OFF will hide rows from UI (persist `*_migrated`), `Refresh` resets to defaults without re-enabling `hasKey`

## Rate limit 429 fix

- Frontend: `qDebounced` 400ms `setTimeout` in `Models.tsx`/`Providers.tsx` — reduces request rate while typing
- Backend: `middleware/rate-limit.ts` `isListEndpoint` (`/v1/models`, `/api/providers`, `/api/models/health`) → `effectiveLimit = max(vk.rpmLimit*4, 200)` — 4x increase for list/pagination/search
- Engine (0.9.0): Redis Lua sliding-window-counter (`lib/sliding-window.ts`) — atomic check+commit, shared across gateway instances, no fixed-window boundary spike; falls back to in-memory fixed window when Redis is down. Same engine drives provider quotas via `checkQuotaAsync` (`lib/quota-tracker.ts`); `recordUsage` dual-writes so `getQuotaHeadroom`/cost-routing keeps working. 429 `provider_errors` entries now carry `retryAfterMs`.

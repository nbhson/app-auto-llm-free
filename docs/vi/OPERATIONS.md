> **Tiếng Việt** | [🇬🇧 English](../en/OPERATIONS.md) | [Docs Index](../README.md)

# Vận hành & Xác thực Free Tier (24h Sync — Live là Source of Truth)

## Vấn đề: freellms.org có thể lỗi thời (đã disabled)

`data/freellms-models-free.json` (316 free) là snapshot 2026-09-06. Provider có thể đã rút free tier (ví dụ Groq 16/23 paid, Ollama Cloud 5/8 paid, OpenRouter 28/45 paid trong scan). **Freellms sync hiện đã disabled** (không còn latest) — live provider APIs mới là source of truth.

## Giải pháp: 2-layer sync (freellms lịch sử + live hiện tại)

### Layer 1 — Freellms sync (lịch sử, disabled)

```bash
python scripts/sync-freellms.py
# Fetch https://freellms.org/providers + /models -> data/*.json + models.yaml
# Trước đây chạy mỗi 24h qua GitHub Actions 02:00 UTC — HIỆN ĐÃ DISABLED, không còn latest
```

File (lịch sử):
- `data/freellms-providers.json` — 30 providers, caps/tier
- `data/freellms-models-free.json` — 316 free, có `score/limit/verified`
- `models.yaml` — 316 entries cho gateway (snapshot)

### Layer 2 — Live verify (Thực sự còn free không?) + Live sync (Source of truth mới)

**A. Verify free** `apps/gateway/src/jobs/verify-free.ts` so sánh **freellms FREE** vs **live /models** từ provider.

**Logic:**

```
for each provider in registry (30):
  keys = config.providerKeys[provider] // từ .env
  if !keys && provider not in [pollinations, llm7-io]:
     mark all its models -> unverified_no_key
     => cần cấu hình API key để xác thực
  else:
     live = await provider.models(keys[0]) // GET {baseUrl}/models
     for each freellms model in that provider:
        found = live contains id or short name
        status = found ? verified_free : deprecated
```

**Trạng thái (`status`):**

| status | Ý nghĩa | Hành động |
|--------|---------|-----------|
| `verified_free` | Provider trả về model, còn free | Dùng bình thường |
| `deprecated` | Freellms nói free nhưng live không còn list → có thể đã rút, đổi tên | Báo deprecated, gateway sẽ skip trong fallback nếu `?verified=free` |
| `unverified_no_key` | Chưa cấu hình API key nên không probe được | Cảnh báo trong `/api/providers` -> `no-key`, cần thêm key vào `.env` |
| `error` | Provider unreachable / 429 | Retry sau |
| `unverified_no_data` | Chưa chạy verify lần nào | Hiển thị freellms data với badge unverified |

**Output:**

- `data/verified-models.json` — 316 rows chi tiết (`live_free`, `last_verified`, `error`)
- `data/verified-summary.json` — tổng hợp (`verified_free`, `deprecated`, `unverified_no_key`)

**B. Live sync (source of truth mới)** `apps/gateway/src/jobs/sync-live-models.ts` fetch **live provider.models()** qua real keys (`hasRealKey: k.length>20 && !k.includes('xxx')`) → `data/live-models.json`.

**Logic freeOnly (mặc định true):**

```
freeOnly = true (mặc định)
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

- `data/live-models.json` — `total:2185, free_only:true, total_fetched, providers, models[]` (882 free / 853 hasKey, alias thêm 2190 total khi serve)
- `POST /api/models/live/sync {freeOnly:true}` — trigger sync (UI nút **Sync Live Now** chỉ pull freeOnly)
- `GET /api/models/live` — get cache
- `GET /v1/models?hasKey=1` — khi có live cache sẽ phục vụ **live 2190 total** thay vì freellms 324
- `GET /api/providers?hasKey=1` — filter real keys, highlight xanh lá
- **Models UI**: pill `hasKey` (Chỉ hiện provider đã nhập key) + `hide404` (Ẩn model 404, mặc định checked, `hide404_migrated` + `hide404` localStorage), 404 strikethrough `line-through #dc2626` + disabled checkbox, persisted `data/model-health.json`, ẩn khi hide404 checked.
- **Sync Live Now** hiện chỉ pull free models (freeOnly=true) — lọc Permanent Free tier hoặc `:free` suffix hoặc freellms free list.

**Rate limit fix**: Frontend debounce `q` 400ms (Models/Providers), backend `middleware/rate-limit.ts` tăng limit list endpoints lên 4x (min 200) để tránh 429 khi gõ/pagination.

## Scheduler tự động (24h — verify + live sync)

`apps/gateway/src/jobs/scheduler.ts` chạy trong gateway:

- Khi start: nếu `data/verified-models.json` cũ hơn `SYNC_INTERVAL_MS` (default 86400000 = 24h) → verify + syncLiveModels sau 5s
- Sau đó `setInterval` mỗi 24h → `verifyFreeModels()` + `saveVerifyReport()` + `syncLiveModels({freeOnly:true})`

Cấu hình:

```env
SYNC_INTERVAL_MS=86400000
DISABLE_SCHEDULER=0   # đặt 1 để tắt
```

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/v1/models?hasKey=1` | **Live source of truth** khi có cache (2190 total) — `q` debounce 400ms, `page`/`limit` LOV 25/50 ở sticky bottom, `provider` filter |
| `GET` | `/v1/models?verified=free` | Chỉ trả models `verified_free` (316 vs 7 bug fix `lib/paths.ts`) — freellms snapshot |
| `GET` | `/v1/models?verified=deprecated` | Chỉ deprecated (kể cả persisted 404/410) |
| `GET` | `/v1/models?verified=unverified` | Chỉ unverified |
| `GET` | `/v1/models?provider=nvidia-nim&hasKey=1` | Filter theo provider + hasKey (real keys) |
| `GET` | `/v1/models?q=gemma&page=1&limit=25` | Search + pagination LOV 25/50 (sticky bottom, debounce 400ms) |
| `GET` | `/api/providers?page=&limit=&q=&hasKey=` | `detailed[]` có `free_models`, `keys`, `hasRealKey`, `Get Key` URL, `status` — pagination 25/50 sticky bottom, `q` debounce 400ms |
| `GET` | `/api/providers/health` | Live ping 43 providers 5s |
| `POST` | `/api/models/live/sync` | **Mới**: Sync live `{freeOnly:true}` → `data/live-models.json` (2185/882) |
| `GET` | `/api/models/live` | **Mới**: Get live cache |
| `GET` | `/api/models/health?model=` | Probe 1 model chat `Hi` 5 tokens 8s → `usable/unusable/no-key/410 Gone` |
| `GET` | `/api/models/health?provider=&limit=` | Bulk probe `limit` models (summary) |
| `GET` | `/api/models/health/persisted` | Persisted 404/410 (`data/model-health.json`) — `hide404` default checked, `hide404_migrated` |
| `POST` | `/api/models/health/mark` | Mark 404/410 `{ids:[],http_status:404,error}` persist + strikethrough |
| `GET` | `/api/verify` | Full report `verified-models.json` |
| `GET` | `/api/verify/summary` | Summary nhanh |
| `POST` | `/api/verify` | Trigger verify ngay (body `{dryRun: false}`), scheduler cũng sync live |
| `GET` | `/api/stats` | `allTimeTokens`, `tokensByProvider`, `avgTokens`, `free_models:316`, `breakers` |
| `GET` | `/api/logs` | Paginated logs |
| `GET` | `/api/logs/stream` | SSE live logs — **Live ON (SSE + 2s poll)**, đã bỏ Auto sync 5s duplicate |
| `GET` | `/api/models/sync` | Freellms sync info (lịch sử, disabled) |

Ví dụ:

```bash
# Live source of truth
curl "http://localhost:8080/v1/models?hasKey=1&limit=25" -H "Authorization: Bearer fgk-xxx" | jq '.total, .pagination'
curl "http://localhost:8080/api/models/live" -H "Authorization: Bearer fgk-master-xxx" | jq
curl -X POST http://localhost:8080/api/models/live/sync -H "Authorization: Bearer fgk-master-xxx" -d '{"freeOnly":true}' | jq '.total, .free_only'
curl "http://localhost:8080/api/providers?hasKey=1" -H "Authorization: Bearer fgk-master-xxx" | jq '.detailed[].hasRealKey'

# Freellms snapshot
curl http://localhost:8080/v1/models?verified=free -H "Authorization: Bearer fgk-xxx" | jq '.total'
curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer fgk-master-xxx" | jq
curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer fgk-master-xxx" -d '{"dryRun":false}' | jq '.total_verified_free'
```

## CLI

```bash
# Dry-run (không cần key, dùng freellms làm live)
npm run verify:free:dry -w apps-gateway

# Live (cần .env keys)
npm run verify:free -w apps-gateway
# hoặc
npx tsx apps/gateway/src/jobs/verify-free.ts --dry-run
npx tsx apps/gateway/src/jobs/sync-live-models.ts # live sync freeOnly
```

## GitHub Actions (daily 02:00 UTC)

`.github/workflows/sync-freellms.yml` chạy (lịch sử):

1. `python scripts/sync-freellms.py` → update `data/*` + `models.yaml` (hiện disabled)
2. `tsx verify-free.ts --dry-run` (hoặc live nếu có secrets `GROQ_API_KEYS` v.v.)
3. Commit nếu có thay đổi → push `main`

Hiện tại khuyến nghị: secrets `GROQ_API_KEYS`, `CEREBRAS_API_KEYS`, `NVIDIA_API_KEYS`, `GEMINI_API_KEYS`… để `jobs/sync-live-models.ts` chạy live thay vì dry-run. Freellms cron giữ để backup nhưng không còn source chính.

## Khuyến nghị vận hành

- **Dev**: chỉ cần live data qua `POST /api/models/live/sync` với 1–2 real keys hoặc freellms snapshot, không cần verify đầy đủ (dry-run <1s)
- **Prod**: cấu hình ít nhất 5 keys P0 (NVIDIA, Groq, Cerebras, Gemini, GitHub) để live sync 882 free (853 hasKey) mỗi 24h; scheduler tự gọi cả verify lẫn syncLiveModels. Các provider còn lại sẽ ở `unverified_no_key` nhưng vẫn phục vụ với cảnh báo
- **Dashboard**: 
  - `/models`: top filter `q` (debounce 400ms) + `verified` + pill `hasKey` (xanh) / `hide404` (đỏ, mặc định checked) + hàng 2 3 nút căn giữa `Check Live` — `Sync Live Now` (freeOnly xanh lá) — `Refresh`; sticky bottom pagination `Page X/Y` + `LOV 25/50`; bảng strikethrough `#dc2626` + checkbox disabled + `hide404` ẩn
  - `/providers`: filter `q` debounce 400ms + pill `hasKey` + highlight `hasRealKey` xanh lá; sticky bottom `LOV 25/50`
  - `/logs`: chỉ **Live ON** (SSE + 2s poll), đã bỏ `Auto sync 5s` duplicate
  - Rate limit list endpoints đã tăng 4x (200) để tránh 429 khi gõ/pagination

## Khi model bị deprecated thì sao?

Gateway sẽ:
- Vẫn giữ trong `GET /v1/models` nhưng kèm `live_status: deprecated` + `persisted_404: true` + strikethrough
- Nếu `?verified=free`, loại bỏ deprecated khỏi list (để client chỉ thấy tier thực sự free)
- `POST /api/models/health/mark` persist 404/410 vào `data/model-health.json` + localStorage `hide404`, router sẽ skip deprecated trong `getProvidersForRequest` nếu có verified data (kết hợp `quota-tracker` dùng verified map)
- `hide404` pill mặc định checked sẽ ẩn các dòng 404 khỏi UI (persist `hide404_migrated`)

## Rate limit 429 fix

- Frontend: `qDebounced` 400ms `setTimeout` trong `Models.tsx`/`Providers.tsx` — giảm request khi gõ
- Backend: `middleware/rate-limit.ts` `isListEndpoint` (`/v1/models`, `/api/providers`, `/api/models/health`) → `effectiveLimit = max(vk.rpmLimit*4, 200)` — tăng 4x cho list/pagination/search

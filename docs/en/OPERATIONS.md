> **English** | [🇻🇳 Tiếng Việt](../vi/OPERATIONS.md) | [Docs Index](../README.md)

# Vận hành & Xác thực Free Tier (24h Sync)

## Vấn đề: freellms.org có thể lỗi thời

`data/freellms-models-free.json` (316 free) là snapshot 2026-09-06. Provider có thể đã rút free tier (ví dụ Groq 16/23 paid, Ollama Cloud 5/8 paid, OpenRouter 28/45 paid trong scan). Cần kiểm tra **thực tế** mỗi 24h.

## Giải pháp: 2-layer sync

### Layer 1 — Freellms sync (Nguồn chân lý ban đầu)

```bash
python scripts/sync-freellms.py
# Fetch https://freellms.org/providers + /models -> data/*.json + models.yaml
# Chạy mỗi 24h qua GitHub Actions 02:00 UTC hoặc thủ công
```

File:
- `data/freellms-providers.json` — 30 providers, caps/tier
- `data/freellms-models-free.json` — 316 free, có `score/limit/verified`
- `models.yaml` — 316 entries cho gateway

### Layer 2 — Live verify (Thực sự còn free không?)

`apps/gateway/src/jobs/verify-free.ts` so sánh **freellms FREE** vs **live /models** từ provider.

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

## Scheduler tự động (24h)

`apps/gateway/src/jobs/scheduler.ts` chạy trong gateway:

- Khi start: nếu `data/verified-models.json` cũ hơn `SYNC_INTERVAL_MS` (default 86400000 = 24h) → verify sau 5s
- Sau đó `setInterval` mỗi 24h → `verifyFreeModels()` + `saveVerifyReport()`

Cấu hình:

```env
SYNC_INTERVAL_MS=86400000
DISABLE_SCHEDULER=0   # đặt 1 để tắt
```

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/v1/models?verified=free` | Chỉ trả models `verified_free` (316 vs 7 bug fix `lib/paths.ts`) |
| `GET` | `/v1/models?verified=deprecated` | Chỉ deprecated |
| `GET` | `/v1/models?verified=unverified` | Chỉ unverified |
| `GET` | `/v1/models?provider=nvidia-nim` | Filter theo provider (đã bỏ ô riêng, dùng filter đầu tiên `Filter id/provider...`) |
| `GET` | `/api/models/health?model=` | Probe 1 model chat `Hi` 5 tokens 8s → `usable/unusable/no-key/410 Gone` |
| `GET` | `/api/models/health?provider=&limit=` | Bulk probe `limit` models (summary) |
| `GET` | `/api/verify` | Full report `verified-models.json` |
| `GET` | `/api/verify/summary` | Summary nhanh |
| `POST` | `/api/verify` | Trigger verify ngay (body `{dryRun: false}`), cần master key |
| `GET` | `/api/providers` | `detailed[]` có `free_models`, `keys`, `Get Key` URL, `status` |
| `GET` | `/api/providers/health` | Live ping 40 providers 5s |
| `GET` | `/api/stats` | `allTimeTokens`, `tokensByProvider`, `avgTokens`, `free_models:316`, `breakers` |

Ví dụ:

```bash
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
```

## GitHub Actions (daily 02:00 UTC)

`.github/workflows/sync-freellms.yml` chạy:

1. `python scripts/sync-freellms.py` → update `data/*` + `models.yaml`
2. `tsx verify-free.ts --dry-run` (hoặc live nếu có secrets `GROQ_API_KEYS` v.v.)
3. Commit nếu có thay đổi → push `main`

Thêm secrets trong repo Settings → Secrets: `GROQ_API_KEYS`, `CEREBRAS_API_KEYS`, `NVIDIA_API_KEYS`, `GEMINI_API_KEYS`… để live verify thay vì dry-run.

## Khuyến nghị vận hành

- **Dev**: chỉ cần `freellms` data, không cần verify (chiếm <1s dry-run)
- **Prod**: cấu hình ít nhất 5 keys P0 (NVIDIA, Groq, Cerebras, Gemini, GitHub) để verify 60–70% models mỗi 24h; các provider còn lại sẽ ở `unverified_no_key` nhưng vẫn phục vụ với cảnh báo
- **Dashboard**: hiển thị badge `verified_free` (xanh), `deprecated` (đỏ), `unverified_no_key` (vàng) trong `/models` page — sẽ làm trong P4

## Khi model bị deprecated thì sao?

Gateway sẽ:
- Vẫn giữ trong `GET /v1/models` nhưng kèm `live_status: deprecated`
- Nếu `?verified=free`, loại bỏ deprecated khỏi list (để client chỉ thấy tier thực sự free)
- Router sẽ skip deprecated trong `getProvidersForRequest` nếu có verified data (P3 sẽ implement `quota-tracker` dùng verified map)

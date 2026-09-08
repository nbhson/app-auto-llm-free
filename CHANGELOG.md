# Changelog

Tất cả thay đổi đáng chú ý sẽ được ghi ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/).

## [0.6.2] - 2026-09-08

### Fixed
- **Anthropic Claude Code 404/400**: `anthropic.ts:144` `post("/messages")` → `post("/")` khi mount `/v1/messages` (duplicate `/v1/messages/messages` 404), `app.ts:60` chấp nhận `x-api-key` cho Claude Code, `normalizeAnthropicModel` `auto`→`claude-3-5-sonnet` và `gateway-llm/auto` giữ nguyên, `system: string|array` + `messages.role: string` + extract `role:system` vào `system`, `max_tokens` optional
- **Fallback strict + .env sync**: `router.ts:25` single-tier `<=8` không append remaining + không re-sort, giữ đúng order `pollinations,llm7-io...`, `.env:20` update `FALLBACK_TIERS` single-tier, phải restart gateway (config boot `config.ts:22`)
- **Docs EN VI**: `docs/en/ARCHITECTURE.md:1` dịch Vietnamese → English (title, overview, request flow, router, key mgmt, rate limit, structure)
- **Logs key warning**: `Logs.tsx:103` `<>` → `<React.Fragment key={l.id}>` fix `Each child should have unique key`
- **Registry alias**: `registry.ts:106` chỉ giữ `gateway-llm/auto` 20 providers, remove `llm-gateway/auto` + `auto` theo yêu cầu, typo `ollama-clound→ollama-cloud`

### Changed
- **Version bump**: `package.json:4` `apps/gateway:4` `apps/web:4` `0.6.1→0.6.2`, `main.tsx:100` badge `v0.6.2`, `app.ts:55` `version 0.6.2`

## [0.6.1] - 2026-09-08

### Fixed
- **Settings embedding check**: `Settings.tsx:132` Check `EMBEDDING_MODEL` + `EMBEDDING_FALLBACKS` via `POST /v1/embeddings` 8s → border `green-500` ok / `red-500` error + chips `✓/✗` như `Models` page, `i18n.tsx:186` `settings.check/checking` VI/EN
- **Master key input + Keys Step 1**: `main.tsx:157` `MASTER` input `disabled=false readOnly=false` + `KeyGen` `genOpen=true` mặc định expand, `Sync from server` cạnh `Use in UI` `Keys.tsx:138` `GET /api/bootstrap` thay vì header refresh, fix `Admin required` `app.ts:91` khi `localStorage` lệch BE
- **Providers**: thêm `claude-code` (Anthropic clone `caps code/vision`) + `codex` (`api.openai.com/v1` `caps code`) `registry.ts:63` `providerMeta:claude-code/codex`, `config.ts:203` `CLAUDE_CODE_API_KEYS`/`CODEX_API_KEYS`/`OPENAI_API_KEYS`, `FALLBACK_TIERS` tier 5 `anthropic/claude-code/codex/agnes-ai`, `getKeyUrls.ts:44`, `.env.example:32`
- **startTime shadowing**: `Settings.tsx:143` rename `const t=setTimeout` → `timer` tránh ghi đè `t("settings.*")` i18n gây `VM3108 startTime` `motion` error

### Changed
- **Version bump**: `package.json:4` `apps/gateway:4` `apps/web:4` `0.6.0→0.6.1`, `main.tsx:100` badge `v0.6.1`, `app.ts:55` `version 0.6.1`

## [0.6.0] - 2026-09-08

### Added
- **Vector 1 — Gateway parity**: `POST /v1/audio/transcriptions|translations|speech` (Groq Whisper, multipart) `routes/v1/audio.ts:1`, `POST /v1/responses` + `GET /v1/responses/:id` + `POST /v1/conversations` (Hebo Responses) `lib/responses-translator.ts:1`, `POST /v1/messages` + `POST /v1/messages/count_tokens` (Anthropic compat) `providers/anthropic.ts:1` + `lib/anthropic-translator.ts:1`, `providers/base.ts:52` mở rộng `transcriptions/speech/responses/anthropic`, `providers/openai-compatible.ts:13` fallback chain, `providers/registry.ts:63` `anthropic`, `config.ts:203` `ANTHROPIC_API_KEYS`, `app.ts:13` mount `/v1/audio|responses|messages|conversations`
- **Vector 2 — Intelligence**: `lib/redis.ts:1` singleton `ioredis`, `lib/token-estimator.ts:1` thử `js-tiktoken` fallback `len/4`, `lib/quota-tracker.ts:1` thêm `RPD/TPD` 24h + `getQuotaHeadroom`, `lib/request-log.ts:7` `cost/cacheHit/compressedTokens` + `p95/cacheHitRate`, `lib/compression.ts:1` 3-engine `toolsMinify/historySummarize/codeDedup`, `lib/cost-router.ts:99` `rankProvidersByCostAndLatency` + `syncPricing` LiteLLM CDN, `lib/semantic-cache.ts:1` `sha256` + Redis + cosine `EMBEDDING_MODEL`, `lib/embeddings.ts:8` fallback chain `cohere→nvidia→cloudflare→hash`, `lib/analytics.ts:53` `GET /api/analytics|cache|compression`, `routes/api.ts:15` `GET /api/config` + `GET /api/cache/stats`, `routes/v1/chat.ts:105` pipeline `Cost→Cache→Compression→Upstream→Cache store`, `docker-compose.yml:36` `redisdata` + env flags
- **Settings UI**: `apps/web/src/pages/Settings.tsx:1` page `/settings` ngoài cùng phải `main.tsx:88` `ml-auto`, defaults `.env` `GET /api/config` → `localStorage.gatewaySettings` `i18n.tsx:11` VI/EN, `.env` snippet copy, `config.ts:161` `EMBEDDING_MODEL` + `EMBEDDING_FALLBACKS`, `docker-compose.yml:36` env
- **Docs & README**: `docs/en|vi/API.md` Audio/Responses/Anthropic + `GET /api/analytics|cache`, `docs/en|vi/ARCHITECTURE.md` Provider interface + Router cost + dir tree, `docs/en|vi/CONFIGURATION.md` Vector 2 flags, `docs/en|vi/ROADMAP.md` P6 `M6`, `README.md:55` pipeline `Cost→Cache→Compression`

### Changed
- **Pipeline re-order**: `routes/v1/chat.ts:114` cache trước compression (chỉ nén khi miss) để tiết kiệm compute, khớp flow `Cost Routing → Semantic Cache → Compression → Upstream`
- **Embedding hard fallback**: `config.ts:161` `EMBEDDING_MODEL` có thể comma-separated + `EMBEDDING_FALLBACKS`, `lib/embeddings.ts:52` `embedWithFallback` thử `cohere`→`nvidia-nim/nv-embed-v1`→`cloudflare/bge-large`→hash, `semantic-cache.ts:58` lưu `embedding` kèm `value` để cosine scan `threshold 0.92`
- **Version bump**: `package.json:4` `apps/gateway:4` `apps/web:4` `0.5.1→0.6.0`, `main.tsx:100` badge `v0.6.0`, `app.ts:55` `version 0.6.0`

## [0.5.1] - 2026-09-08

### Fixed
- **6 models by default (b930e6d regression)**: `apps/gateway/src/routes/v1/models.ts:27` fallback `data/freellms-models-free.json` (deleted, fresh clone empty) → `models.yaml` (312–316 snapshot) nếu json thiếu. Trước fix `loadFreellmsModels()` trả `[]` → fallback `staticModels` 6 models (`groq/llama-3.3-70b` etc.). Sau fix `GET /v1/models?limit=1000` trả `354` total (hasKey OFF, freellms 316 + supplement + pollinations) và `819` khi `?hasKey=1` (live 788). Đã khôi phục `data/*.json` cục bộ để test nhưng code mới xử `fresh clone` không cần data.

## [0.5.0] - 2026-09-08

### Fixed
- **Windows `better-sqlite3` + Node 22**: require `Node >=22` (`package.json:37` engines), `better-sqlite3@^13.0.3` prebuild ABI 127–147, fix `gyp ERR!` trên Windows nvm4w + thiếu Build Tools — docs `README.md:70`, `docs/en|vi/GETTING_STARTED.md:8`, `docs/en|vi/CONFIGURATION.md:176` (Node 22 LTS, `node:22-alpine`).

### Changed
- **Providers 43→41**: remove `9router`/`omniroute` (`config.ts:192`, `registry.ts:49`, `routes/v1/models.ts:122` + aliases `ag/gemini-3.7-flash-high`, `kc/minimax-m3:free` etc.) — docs `README.md:8`, `docs/en|vi/PROVIDERS.md`, `docs/en|vi/API.md`, `docs/en|vi/ARCHITECTURE.md` cập nhật `41 IDs (30+11 alias)`, health `41` providers.
- **Fresh clone data empty**: `b930e6d` xóa `data/*.json`, `.gitignore:18` `data/*.json` + `!data/.gitkeep`, `data/.gitkeep` + `apps/data/.gitkeep` — fresh clone chỉ có `.gitkeep`, phải chạy `Sync Live Now` `POST /api/models/live/sync` để nạp `data/live-models.json` — docs `GETTING_STARTED.md:36`, `CONFIGURATION.md:71`.
- **Docs Node + Windows**: `e1293db` badge `Hono+Bun→Hono+Node`, `README.md:70` `Node >=22 + npm >=10`, `GETTING_STARTED.md:148` + `CONFIGURATION.md:65` thêm kill old process guide per OS (Docker `restart gateway`, macOS/Linux `pkill+lsof`, Windows PowerShell `netstat/taskkill/Get-NetTCPConnection` + CMD/Git Bash).

### Added
- **Auto-bind MASTER_KEY bootstrap** (`8f1b3b7`): gateway public `GET /api/bootstrap` + `/api/config/master` (`app.ts:23`, bypass `/api/*` auth, disable via `EXPOSE_BOOTSTRAP=false`), web header Master input editable (password/text toggle, `main.tsx:40`) auto-fetch bootstrap nếu `localStorage` placeholder (`fgk-master-dev-key`/`change-me`/len<16) và re-bootstrap khi `401` — docs `GETTING_STARTED.md:36`, `ARCHITECTURE.md:27`, `CONFIGURATION.md:23`, `API.md:155`.

## [Unreleased]

### Fixed
- **better-sqlite3 Node 26**: upgrade `better-sqlite3` `^9.2.2` → `^13.0.3` (`apps/gateway/package.json:34`) với prebuild Node 20–26 (ABI 147). Fix `npm i` lỗi `node-gyp` / `v8-internal.h: concept/requires` trên Node 26 + Apple clang 21. Docs thêm troubleshooting Node 20–26 ở `docs/GETTING_STARTED.md:8`, `docs/en/GETTING_STARTED.md:8`, `docs/vi/GETTING_STARTED.md:8` — Docker (`node:20-alpine`) không ảnh hưởng.

### Added
- **P1 Scaffold**: Hono 4.x + Vite React, Drizzle SQLite, Docker Compose, `.env.example` 30 providers, `GET /v1/health` + `GET /v1/models` (316 free)
- **Freellms Sync**: Scan `https://freellms.org/providers` (30) + `/models` (365, 316 free `data-free=1`), `data/freellms-providers.json`, `data/freellms-models-free.json`, `models.yaml` (316), `scripts/sync-freellms.py`
- **Providers Registry**: 40 ids (30 freellms slugs + alias), baseUrls từ freellms, `providerMeta` caps/tier, alias `auto/gpt-4/glm/qwen/code/embedding` (12 keys), 4-tier `FALLBACK_TIERS`
- **Live Verify (24h)**: `jobs/verify-free.ts` probe live `/models` vs freellms, statuses `verified_free/deprecated/unverified_no_key/error`, `data/verified-models.json` + `summary`, `GET /v1/models?verified=free` filter, `GET /api/verify` + `POST /api/verify`, dry-run cho CI
- **Scheduler**: `jobs/scheduler.ts` `SYNC_INTERVAL_MS=86400000` (24h), auto verify sau 5s nếu stale, `DISABLE_SCHEDULER` flag, `src/index.ts` startScheduler
- **GitHub Actions**: `.github/workflows/sync-freellms.yml` daily 02:00 UTC — sync + verify + auto-commit
- **Docs**: `ARCHITECTURE.md` (30 providers, 316, scheduler), `API.md` (verified filters, /api/verify), `PROVIDERS.md` (30 bảng baseUrls), `FREELLMS_FREE_TIER.md` (ranking, 316), `OPERATIONS.md` (2-layer sync), `CONFIGURATION.md` (30 envs + tiers + rate limits), `DEPLOYMENT.md` (scheduler + cron), `ROADMAP.md` (P1 done + verify)
- **Gateway**: `models` route freellms + verified annotate, `api` route detailed + stats, `openai-compatible` allow no-key
- **P2 Gateway Core**: 30 adapters, streaming SSE (Gemini `alt=sse` → OpenAI), tool calling, `auto` 15-tier fallback → pollinations live (10.3s), `x-router` pin, `models` pollinations fallback, e2e pollinations (gpt-oss-20b) non-stream/stream
- **P3 Resilience**: `key-manager.ts` AES-256-GCM + round-robin + `markRateLimited`, `token-estimator.ts` char/4, `quota-tracker.ts` FREELLMS_LIMITS RPM/TPM + `checkQuota/recordUsage`, `circuit-breaker.ts` 5/30s half-open, chat integration (quota pre-check, breaker skip, deprecated skip, `X-Verified`), `GET /api/providers/health` live parallel 5s (online 13/offline 25)
- **P4 Auth+Dashboard**: `lib/virtual-keys.ts` `fgk-...` CRUD SHA256 + scopes + RPM + `data/virtual-keys.json`, `middleware/rate-limit.ts` virtualKey RPM + `x-ratelimit-*`, `app.ts` scope check `x-router` & model + admin gate, `lib/request-log.ts` 1000 logs + tokens aggregation (`allTimeTokens`, `tokensByProvider`, `avgTokens`) `data/request-log.json` + SSE `onLog`, `routes/api.ts` `GET/POST/DELETE /api/keys` + `GET /api/logs` + `/api/logs/stream` + `/api/stats` logs/breakers, chat `addLog` per request, Vite Dashboard 5 routes (Dashboard 4 cards + 3 charts + tokens + recent logs, Models 316 checkbox + single Check Live + Used/Limit, Providers Get Key ↗ + health, Keys Generator + CRUD + Quick Test, Logs 3 charts + SSE) + `lib/paths.ts` fix 7→316 + `lib/getKeyUrls.ts` 30 console URLs
- **P5 Polish**: nav sticky Providers→Models (swap), Dashboard Key Generator move to `/keys`, `index.css` unified card/button/table (nav style), Models remove provider input (use first filter), Stats Detail fix horizontal scroll (pre-wrap + 4000 truncate)

### Changed
- `config.ts` hỗ trợ 30 providers keys + 4-tier default
- `openai-compatible.ts` resolve `{account_id}`, model after first slash, allow no-key, forward full fields
- `gemini.ts` sanitize + `alt=sse` + `gemini-stream.ts`
- `router.ts` `ALLOW_NO_KEY`, `auto` 15-tier, `isPublicProvider`
- `app.ts` virtualKeyRateLimit + isValidVirtualKeyLive + scope checks
- `routes/v1/chat.ts` hasScope + quota + breaker + verified skip + request-log
- `README.md` cập nhật 30 providers / 316 models / P2+P3+P4 done

### Planned
- Post-MVP: `/v1/embeddings`, `/v1/images`, Anthropic compat, BYOK, OAuth

## [1.0.0] - 2026-09-06

- **P5 Hardening**: `wrangler.jsonc` Cloudflare Workers (WinterCG `nodejs_compat`, KV, crons 02:00), `Dockerfile` multi-stage prod (non-root `app`, HEALTHCHECK 30s, copy `data`+`models.yaml`), `lib/otel.ts` GenAI OTel (`gen_ai.*`, `trace_id`, `withTrace`), `app.ts` `secureHeaders` + `cors maxAge 86400` + `bodyLimit` 10MB, `scripts/benchmark.ts` (health 40 + chat pollinations + models/verified → `data/benchmark.json` + `PROVIDER_TEST_RESULTS.md` online 13/offline 25), `scripts/rotate-keys.ts` AES re-encrypt, `SECURITY.md` hardening checklist + rotation docs, `PROVIDER_TEST_RESULTS.md` 2026-09-06T08:26
- MVP 100%: 30 providers, 316 free, 40 ids, 5 Dashboard routes, 24h verify, 15-tier fallback, streaming + tools

## [0.2.0] - 2026-09-06

- Freellms integration: 30 providers, 316 free models, live verify 24h

## [0.1.0] - 2026-09-06

- Initial commit (Apache-2.0)
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/PROVIDERS.md`, `docs/API.md`, `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`, `docs/ROADMAP.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `.gitignore`
- Scaffold Hono + Vite + Drizzle + Docker, `GET /v1/models` mock

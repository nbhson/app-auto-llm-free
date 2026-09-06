# Changelog

Tất cả thay đổi đáng chú ý sẽ được ghi ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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

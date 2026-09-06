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
- **Gateway**: `models` route freellms + verified annotate, `api` route detailed + stats, `openai-compatible` allow no-key cho public providers

### Changed
- `config.ts` hỗ trợ 30 providers keys + 4-tier default
- `openai-compatible.ts` cho phép fetch không cần key cho public providers (llm7, huggingface)
- `README.md` cập nhật 30 providers / 316 models / docs links / roadmap

### Planned
- P2 Gateway Core: streaming thực + tool calling (adapters đã có stub)
- P3 Resilience: key-manager quota-tracker skip deprecated, health live 30
- P4 Dashboard: model catalog 316 với badge verified/deprecated
- P5 Hardening: benchmark verified

## [0.2.0] - 2026-09-06

- Freellms integration: 30 providers, 316 free models, live verify 24h

## [0.1.0] - 2026-09-06

- Initial commit (Apache-2.0)
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/PROVIDERS.md`, `docs/API.md`, `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`, `docs/ROADMAP.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `.gitignore`
- Scaffold Hono + Vite + Drizzle + Docker, `GET /v1/models` mock

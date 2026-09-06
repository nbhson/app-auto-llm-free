# Roadmap

Lộ trình 5 phases, tổng ~11-16 ngày cho MVP.

## P1 — Scaffold (1-2 ngày) ✅ Done 2026-09-06

- [x] `bun create hono` → `apps/gateway` (Hono + zod-validator + hono/proxy)
- [x] `apps/web` Vite + React + shadcn/ui + TanStack Query
- [x] Drizzle ORM + SQLite (dev) / Postgres (prod), `drizzle.config.ts`, migrate đầu tiên
- [x] Docker + docker-compose.yml + .env.example
- [x] `GET /v1/models` (316 free từ freellms) + `GET /v1/health`
- [x] CI: `bun run lint`, `bun run typecheck`
- [x] Freellms sync: 30 providers, 316 free, `data/*.json` + `models.yaml` + `scripts/sync-freellms.py`
- [x] Verify live (24h): `jobs/verify-free.ts` + `jobs/scheduler.ts` + `/api/verify` + GitHub Actions daily 02:00 UTC

## P2 — Gateway Core (3-5 ngày)

- [ ] `Provider` interface + `providers/base.ts`
- [ ] Adapters đầu: `groq`, `gemini`, `cerebras`, `pollinations` (3 openai-compatible + 1 gemini + 1 scraped)
- [ ] `POST /v1/chat/completions` non-stream + stream SSE passthrough
- [ ] `format-translator.ts` (OpenAI ↔ Gemini/Anthropic)
- [ ] `models.yaml` + `jobs/sync.ts` (fetch LiteLLM pricing)
- [ ] Test e2e với OpenAI SDK

## P3 — Resilience (2-3 ngày)

- [ ] `key-manager.ts` (round-robin, AES-256-GCM, skip rate-limited)
- [ ] `quota-tracker.ts` + `rate-tracker.ts` (RPM/RPD/TPM/TPD rolling window, Redis)
- [ ] `smart-router.ts` + `router.ts` (round-robin, tiered, alias)
- [ ] `token-estimator.ts` (js-tiktoken pre-flight)
- [ ] Circuit breaker + tiered fallback + mid-stream error handling
- [ ] `GET /api/providers/health` + cron health check

## P4 — Auth + Dashboard (3-4 ngày)

- [ ] Virtual keys `fgk-...` (CRUD `/api/keys`, scopes, timing-safe)
- [ ] `middleware/auth.ts`, `middleware/rateLimit.ts`
- [ ] Dashboard pages: `/dashboard`, `/models`, `/providers`, `/keys`, `/logs`
- [ ] `request_db.ts` + `/api/logs` + `/api/logs/stream` SSE
- [ ] `/api/stats` (QPS, latency, fallback rate)
- [ ] Docs Swagger `/docs`

## P5 — Hardening & Deploy (2 ngày)

- [ ] AES key rotation, `MASTER_KEY` bootstrap
- [ ] OTel GenAI, `pino` logger, `bodyLimit` 10MB
- [ ] Dockerfile multi-stage, `wrangler.jsonc` Cloudflare preset
- [ ] Benchmark (`benchmark.py` port) + `PROVIDER_TEST_RESULTS.md`
- [ ] `SECURITY.md`, rate-limit hardening, CORS

## Sau MVP (Backlog)

- [ ] `/v1/embeddings`, `/v1/images/generations`, `/v1/audio/*`
- [ ] `/responses` + `/conversations` (Hebo style, Open Responses API)
- [ ] Anthropic-compatible `/messages`
- [ ] BYOK public self-serve (user tự add key qua Dashboard)
- [ ] OAuth providers (Copilot/Cursor/Kiro) như OmniRoute embedded services
- [ ] Token compression (12 engines như OmniRoute) để giảm cost
- [ ] Admin analytics: cost tracking, savings, per-key billing

## Milestones

| Milestone | Date | Deliverable |
|-----------|------|-------------|
| M1 | P1 done | Gateway chạy local, `/v1/models` hoạt động |
| M2 | P2 done | Chat completions streaming với 4 providers |
| M3 | P3 done | Fallback tự động, không còn single point of failure |
| M4 | P4 done | Dashboard + virtual keys hoàn chỉnh |
| M5 | P5 done | Docker production + Cloudflare deploy + docs |

Gantt tham khảo trong `docs/ARCHITECTURE.md`.

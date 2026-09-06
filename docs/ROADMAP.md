# Roadmap

Lộ trình 5 phases, tổng ~11-16 ngày cho MVP.

## P1 — Scaffold (1-2 ngày) ✅ Done 2026-09-06

- [x] `bun create hono` → `apps/gateway` (Hono + zod-validator + hono/proxy)
- [x] `apps/web` Vite + React + shadcn/ui + TanStack Query
- [x] Drizzle ORM + SQLite (dev) / Postgres (prod), `drizzle.config.ts`, migrate đầu tiên
- [x] Docker + docker-compose.yml + .env.example (30 providers, 4-tier freellms)
- [x] `GET /v1/models` (316 free từ freellms) + `GET /v1/health` (40 providers)
- [x] `Provider` interface + `providers/base.ts`, `openai-compatible.ts`, `gemini.ts`, `pollinations.ts`
- [x] `format-translator.ts` (OpenAI ↔ Gemini), `POST /v1/chat/completions` fallback mock + streaming SSE
- [x] `models.yaml` (316) + `data/freellms-*.json` + `scripts/sync-freellms.py`
- [x] Verify live (24h): `jobs/verify-free.ts` (probe 30 providers) + `jobs/scheduler.ts` (86400000) + `/api/verify` + `GET /v1/models?verified=free`
- [x] GitHub Actions daily 02:00 UTC `.github/workflows/sync-freellms.yml`
- [x] CI: `bun run lint`, `bun run typecheck`, build ok

## P2 — Gateway Core (3-5 ngày) ⏳ In progress (adapters done, cần streaming thực)

- [x] `Provider` interface + `providers/base.ts`
- [x] Adapters 30 providers: `nvidia-nim` (97), `modelscope` (43), `cloudflare` (35), `groq` (7), `cerebras` (5)… + `pollinations`
- [x] `POST /v1/chat/completions` non-stream mock + streaming passthrough (cơ bản)
- [x] `format-translator.ts` (OpenAI ↔ Gemini)
- [x] `models.yaml` + `jobs/sync.ts` (stub) + `scripts/sync-freellms.py` (thực)
- [ ] Test e2e với OpenAI SDK (live keys) + SSE mid-stream error handling đầy đủ
- [ ] Tool calling / function calling cho Gemini + OpenAI compat
- [ ] `GET /v1/models` với `live_status` badge (đã có) + pagination

## P3 — Resilience (2-3 ngày)

- [ ] `key-manager.ts` (round-robin, AES-256-GCM, skip rate-limited, `Retry-After`)
- [ ] `quota-tracker.ts` + `rate-tracker.ts` (RPM/RPD/TPM/TPD rolling window, Redis) — dùng `limit` từ `models.yaml:1` (NVIDIA 40 RPM, Groq 30/14.4K, Cerebras 15/1M TPD v.v.)
- [ ] `smart-router.ts` + `router.ts` (round-robin, tiered 4-tier, alias 12 keys) — đã có cơ bản, cần gắn verified filter
- [ ] `token-estimator.ts` (js-tiktoken pre-flight)
- [ ] Circuit breaker (5 fails/30s) + tiered fallback đã có stub, cần test với 30 providers
- [ ] `GET /api/providers/health` live ping 30 providers (hiện stub) + cron scheduler đã có
- [ ] `verify-free` gắn vào `quota-tracker` để skip `deprecated` trong routing

## P4 — Auth + Dashboard (3-4 ngày)

- [ ] Virtual keys `fgk-...` (CRUD `/api/keys`, scopes, timing-safe) — stub hiện mock
- [ ] `middleware/auth.ts` (timing-safe done), `middleware/rateLimit.ts` (stub)
- [ ] Dashboard pages: `/dashboard` (stats + verify summary), `/models` (316 + filter verified), `/providers` (30 + `detailed[]`), `/keys`, `/logs`
- [ ] `request_db.ts` + `/api/logs` + `/api/logs/stream` SSE
- [ ] `/api/stats` đã có (providers 40, free_models 316), cần thêm QPS/latency/fallback rate
- [ ] Docs Swagger `/docs`

## P5 — Hardening & Deploy (2 ngày)

- [ ] AES key rotation, `MASTER_KEY` bootstrap
- [ ] OTel GenAI, `pino` logger (đã có), `bodyLimit` 10MB (đã có)
- [ ] Dockerfile multi-stage, `wrangler.jsonc` Cloudflare preset, `docker-compose.yml` (đã có)
- [ ] Benchmark (`benchmark.py` port) + `PROVIDER_TEST_RESULTS.md` (dùng `data/verified-models.json` làm benchmark)
- [ ] `SECURITY.md`, rate-limit hardening, CORS (đã có cơ bản)

## Sau MVP (Backlog)

- [ ] `/v1/embeddings` (Cohere, NVIDIA), `/v1/images/generations` (Pollinations), `/v1/audio/*`
- [ ] `/responses` + `/conversations` (Hebo style, Open Responses API)
- [ ] Anthropic-compatible `/messages` (đã có interface `anthropic` stub)
- [ ] BYOK public self-serve (user tự add key qua Dashboard)
- [ ] OAuth providers (Copilot/Cursor/Kiro) như OmniRoute embedded services
- [ ] Token compression (12 engines như OmniRoute) để giảm cost
- [ ] Admin analytics: cost tracking, savings, per-key billing

## Milestones

| Milestone | Date | Deliverable |
|-----------|------|-------------|
| M1 | 2026-09-06 | P1 done: Gateway 40 providers, 316 models, `/v1/models?verified=free`, scheduler 24h |
| M2 | P2 | Chat completions streaming live với 30 providers (cần keys) |
| M3 | P3 | Fallback + quota-tracker + skip deprecated, health live 30 |
| M4 | P4 | Dashboard 316 models + verify badges, virtual keys |
| M5 | P5 | Docker prod + Cloudflare + benchmark verified |

Gantt tham khảo trong `docs/ARCHITECTURE.md:1`.

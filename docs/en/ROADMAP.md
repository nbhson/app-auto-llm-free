> **English** | [🇻🇳 Tiếng Việt](../vi/ROADMAP.md) | [Docs Index](../README.md)

# Roadmap

5-phase roadmap, ~11–16 days total for the MVP.

## P1 — Scaffold (1–2 days) ✅ Done 2026-09-06

- [x] `bun create hono` → `apps/gateway` (Hono + zod-validator + hono/proxy)
- [x] `apps/web` Vite + React + shadcn/ui + TanStack Query
- [x] Drizzle ORM + SQLite (dev) / Postgres (prod), `drizzle.config.ts`, first migration
- [x] Docker + docker-compose.yml + .env.example (30 providers, 4-tier freellms)
- [x] `GET /v1/models` (316 free from freellms) + `GET /v1/health` (40 providers)
- [x] `Provider` interface + `providers/base.ts`, `openai-compatible.ts`, `gemini.ts`, `pollinations.ts`
- [x] `format-translator.ts` (OpenAI ↔ Gemini), `POST /v1/chat/completions` fallback mock + streaming SSE
- [x] `models.yaml` (316) + `data/freellms-*.json` + `scripts/sync-freellms.py`
- [x] Live verify (24h): `jobs/verify-free.ts` (probe 30 providers) + `jobs/scheduler.ts` (86400000) + `/api/verify` + `GET /v1/models?verified=free`
- [x] GitHub Actions daily at 02:00 UTC `.github/workflows/sync-freellms.yml`
- [x] CI: `bun run lint`, `bun run typecheck`, build passing

## P2 — Gateway Core (3–5 days) ✅ Done 2026-09-06 (P2.1)

- [x] `Provider` interface + `providers/base.ts` (extended `ChatRequest` with n/stop/presence_penalty...)
- [x] 30 provider adapters: `nvidia-nim` (97), `modelscope` (43), `cloudflare` (35), `groq` (7), `cerebras` (5)… + `pollinations` (alias `auto` 15-tier)
- [x] `POST /v1/chat/completions` — tiered fallback across 15 providers, `x-router` header pin, streaming SSE passthrough (OpenAI + Gemini `alt=sse` → `gemini-stream.ts` → OpenAI chunks), non-stream Gemini normalization, tool calling passthrough (tools/tool_choice/top_p/top_k/n/stop...)
- [x] `format-translator.ts` (OpenAI ↔ Gemini with tools → functionDeclarations) + `lib/gemini-stream.ts` (Gemini JSON → OpenAI `data: {...}\n\n` + `[DONE]`)
- [x] `lib/router.ts` — `ALLOW_NO_KEY` (pollinations/llm7/huggingface), `getNextKey`, `isPublicProvider`, `auto` 15-tier
- [x] `providers/openai-compatible.ts` — resolves `{account_id}`, model after first slash (`z-ai/glm-5.2`), allows no-key headers, forwards all fields
- [x] `providers/gemini.ts` — sanitizes model (`gemini 3.6 flash` → `gemini-2.0-flash`), `alt=sse`, stream transform
- [x] `models.yaml` (316) + `GET /v1/models` with `live_status` badge + `?verified=free` filter + pollinations fallback
- [x] Live e2e tests: `pollinations/openai` non-stream (Hello → gpt-oss-20b), streaming (haiku SSE), `auto` fallback 15 tiers → pollinations (10.3s, mock removed), `x-router` pin, tool calling (pollinations 402 expected, non-tool 200)
- [x] `npm run build` passing, `tsc` passing

## P3 — Resilience (2–3 days) ✅ Done 2026-09-06 (P3.1)

- [x] `lib/key-manager.ts` — AES-256-GCM `encrypt/decrypt` (iv:tag:ciphertext), round-robin + `getNextKeyManaged`, `markRateLimited` (Retry-After), `markSuccess`, `getKeyStats`, `ALLOW_NO_KEY` public (pollinations/llm7/huggingface)
- [x] `lib/token-estimator.ts` — char/4 heuristic, `estimateMessagesTokens`, `estimateChatTokens` (prompt/completion)
- [x] `lib/quota-tracker.ts` — `FREELLMS_LIMITS` (NVIDIA 40, Groq 30/14.4K, Cerebras 15/1M TPD, Gemini 15/1.5K, OVH 2 anon, Agnes 30, OpenRouter 200, Kilo ~200/hr, pollinations 60), RPM/TPM 60s window, `checkQuota` + `recordUsage`
- [x] `lib/circuit-breaker.ts` — `recordSuccess/Failure`, `isOpen` (threshold 5, cooldown 30s), half-open trial, `getAllStates`
- [x] `lib/router.ts` — `getProvidersForRequest` tiered 15 + `isPublicProvider`, verified filter (skips `deprecated` per `verified-models.json`)
- [x] `routes/v1/chat.ts` — quota pre-check (`estimateChatTokens` → `checkQuota`), circuit `isOpen` skip, `markRateLimited` on 429, `recordSuccess/Failure`, `recordUsage`, `X-Verified` header, mock fallback in dev
- [x] `routes/api.ts` — `GET /api/providers/health` live ping of 43 providers in parallel with 5s timeout, latency, breaker state, summary (online/offline/no_key/open_breaker)
- [x] Tests: `GET /api/providers/health` live (online 13, offline 25), `POST /v1/chat/completions` auto → pollinations still succeeds with quota/breaker, `X-Verified` header

## P4 — Auth + Dashboard (3–4 days) ✅ Done 2026-09-06 (P4.1)

- [x] `lib/virtual-keys.ts` — `fgk-...` CRUD (SHA256 hash, scopes models/providers, rpmLimit, role admin/user), `data/virtual-keys.json` persistence, `isValidVirtualKeyLive` + `hasScope`, master `fgk-master-...` admin
- [x] `lib/auth.ts` timing-safe + `middleware/rate-limit.ts` virtualKey RPM (`x-ratelimit-*`), `app.ts` `virtualKeyRateLimit` + scope check for `x-router` & model
- [x] `lib/request-log.ts` — 1000 logs, `data/request-log.json` persistence, `getLogs/getStats/onLog` SSE, `apps/gateway/src/routes/v1/chat.ts` `addLog` per request (prompt/completion/latency/verifiedStatus)
- [x] `routes/api.ts` — `GET /api/keys` list, `POST /api/keys` create (admin), `DELETE /api/keys/:id`, `GET /api/logs` + `GET /api/logs/stream` SSE, `GET /api/stats` with `logs` + `breakers`
- [x] Dashboard Vite — `main.tsx` masterKey input, 5 routes: `/` Dashboard (providers 40, verify 314/316, requests avg ms, recent logs), `/models` 316 + filter `verified` + green/red/yellow badges, `/providers` detailed + live health check, `/keys` CRUD `fgk-...` with scopes, `/logs` live SSE + polling
- [x] E2e tests: `POST /api/keys` master → `fgk-...`, `GET /api/keys` list 3, `POST /v1/chat/completions` pollinations with virtual key → `gpt-oss-20b`, scope violation `nvidia-nim` → 403, RPM 2 → 429 `Virtual key RPM limit 2 exceeded`, logs SSE, stats `byProvider`

## P5 — Hardening & Deploy (2 days) ✅ Done 2026-09-06 (P5.1) + polish 2026-09-06

- [x] `scripts/rotate-keys.ts` — AES re-encrypt (OLD/NEW), `MASTER_KEY` bootstrap
- [x] `lib/otel.ts` — GenAI OTel, `app.ts` `secureHeaders` + `cors maxAge 86400` + `bodyLimit` 10MB + rate-limit hardening
- [x] `apps/gateway/Dockerfile` prod non-root + HEALTHCHECK + `lib/paths.ts` fix 7→316 (cwd root vs apps/gateway) + `data/verified-models.json` 320
- [x] `apps/gateway/wrangler.jsonc` Cloudflare Workers preset
- [x] `scripts/benchmark.ts` + `PROVIDER_TEST_RESULTS.md` (online 13/offline 25, chat 1539ms, verified 314/316)
- [x] `SECURITY.md` hardening checklist
- [x] Web polish: sticky nav Providers→Models (swap), Dashboard Key Generator moved to `/keys`, Quick Test moved to `/keys`, Models checkbox + single `Check Live` + `Used/Limit`, `index.css` unified card/button/table (nav style), charts + token (Dashboard 4th card + Logs 630kb recharts), `PROVIDER_TEST_RESULTS` + `benchmark`

## Post-MVP (Backlog)

- [ ] `/v1/embeddings` (Cohere, NVIDIA), `/v1/images/generations` (Pollinations), `/v1/audio/*`
- [ ] `/responses` + `/conversations` (Hebo style, Open Responses API)
- [ ] Anthropic-compatible `/messages` (interface `anthropic` stub already exists)
- [ ] BYOK public self-serve (users add their own keys via Dashboard)
- [ ] OAuth providers (Copilot/Cursor/Kiro) like OmniRoute embedded services
- [ ] Token compression (12 engines like OmniRoute) to reduce cost
- [ ] Admin analytics: cost tracking, savings, per-key billing

## Milestones

| Milestone | Date | Deliverable |
|-----------|------|-------------|
| M1 | 2026-09-06 | P1 done: Gateway 40 providers, 316 models, `/v1/models?verified=free`, 24h scheduler |
| M2 | 2026-09-06 | P2 done: 30 adapters, streaming Gemini SSE, `auto` 15-tier → pollinations live, `x-router` pin |
| M3 | 2026-09-06 | P3 done: key-manager AES-GCM, quota RPM/TPM, breaker 5/30s, health live 40 (online 13) |
| M4 | 2026-09-06 | P4 done: virtual keys `fgk-...` CRUD + logs SSE + Dashboard 5 routes |
| M5 | 2026-09-06 | P5 done: wrangler + Dockerfile prod + OTel + benchmark + SECURITY rotate + PROVIDER_TEST_RESULTS |

Gantt chart reference in `docs/ARCHITECTURE.md:1`.

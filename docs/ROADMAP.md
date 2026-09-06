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

## P2 — Gateway Core (3-5 ngày) ✅ Done 2026-09-06 (P2.1)

- [x] `Provider` interface + `providers/base.ts` (mở rộng `ChatRequest` n/stop/presence_penalty...)
- [x] Adapters 30 providers: `nvidia-nim` (97), `modelscope` (43), `cloudflare` (35), `groq` (7), `cerebras` (5)… + `pollinations` (alias `auto` 15-tier)
- [x] `POST /v1/chat/completions` — tiered fallback 15 providers, `x-router` header pin, streaming SSE passthrough (OpenAI + Gemini `alt=sse` → `gemini-stream.ts` → OpenAI chunks), non-stream normalize Gemini, tool calling passthrough (tools/tool_choice/top_p/top_k/n/stop...)
- [x] `format-translator.ts` (OpenAI ↔ Gemini với tools → functionDeclarations) + `lib/gemini-stream.ts` (Gemini JSON → OpenAI `data: {...}\n\n` + `[DONE]`)
- [x] `lib/router.ts` — `ALLOW_NO_KEY` (pollinations/llm7/huggingface), `getNextKey`, `isPublicProvider`, `auto` 15-tier
- [x] `providers/openai-compatible.ts` — resolve `{account_id}`, model after first slash (`z-ai/glm-5.2`), allow no-key headers, forward full fields
- [x] `providers/gemini.ts` — sanitize model (`gemini 3.6 flash` → `gemini-2.0-flash`), `alt=sse`, stream transform
- [x] `models.yaml` (316) + `GET /v1/models` với `live_status` badge + `?verified=free` filter + pollinations fallback
- [x] Test e2e live: `pollinations/openai` non-stream (Hello → gpt-oss-20b), streaming (haiku SSE), `auto` fallback 15 tiers → pollinations (10.3s, mock removed), `x-router` pin, tool calling (pollinations 402 expected, non-tool 200)
- [x] `npm run build` ok, `tsc` ok

## P3 — Resilience (2-3 ngày) ✅ Done 2026-09-06 (P3.1)

- [x] `lib/key-manager.ts` — AES-256-GCM `encrypt/decrypt` (iv:tag:ciphertext), round-robin + `getNextKeyManaged`, `markRateLimited` (Retry-After), `markSuccess`, `getKeyStats`, `ALLOW_NO_KEY` public (pollinations/llm7/huggingface)
- [x] `lib/token-estimator.ts` — char/4 heuristic, `estimateMessagesTokens`, `estimateChatTokens` (prompt/completion)
- [x] `lib/quota-tracker.ts` — `FREELLMS_LIMITS` (NVIDIA 40, Groq 30/14.4K, Cerebras 15/1M TPD, Gemini 15/1.5K, OVH 2 anon, Agnes 30, OpenRouter 200, Kilo ~200/hr, pollinations 60), RPM/TPM 60s window, `checkQuota` + `recordUsage`
- [x] `lib/circuit-breaker.ts` — `recordSuccess/Failure`, `isOpen` (threshold 5, cooldown 30s), half-open trial, `getAllStates`
- [x] `lib/router.ts` — `getProvidersForRequest` tiered 15 + `isPublicProvider`, verified filter (skip `deprecated` per `verified-models.json`)
- [x] `routes/v1/chat.ts` — quota pre-check (`estimateChatTokens` → `checkQuota`), circuit `isOpen` skip, `markRateLimited` on 429, `recordSuccess/Failure`, `recordUsage`, `X-Verified` header, mock fallback dev
- [x] `routes/api.ts` — `GET /api/providers/health` live ping 40 providers parallel 5s timeout, latency, breaker state, summary (online/offline/no_key/open_breaker)
- [x] Test: `GET /api/providers/health` live (online 13, offline 25), `POST /v1/chat/completions` auto → pollinations vẫn succeed với quota/breaker, `X-Verified` header

## P4 — Auth + Dashboard (3-4 ngày) ✅ Done 2026-09-06 (P4.1)

- [x] `lib/virtual-keys.ts` — `fgk-...` CRUD (hash SHA256, scopes models/providers, rpmLimit, role admin/user), `data/virtual-keys.json` persist, `isValidVirtualKeyLive` + `hasScope`, master `fgk-master-...` admin
- [x] `lib/auth.ts` timing-safe + `middleware/rate-limit.ts` virtualKey RPM (`x-ratelimit-*`), `app.ts` `virtualKeyRateLimit` + scope check `x-router` & model
- [x] `lib/request-log.ts` — 1000 logs, `data/request-log.json` persist, `getLogs/getStats/onLog` SSE, `apps/gateway/src/routes/v1/chat.ts` `addLog` per request (prompt/completion/latency/verifiedStatus)
- [x] `routes/api.ts` — `GET /api/keys` list, `POST /api/keys` create (admin), `DELETE /api/keys/:id`, `GET /api/logs` + `GET /api/logs/stream` SSE, `GET /api/stats` với `logs` + `breakers`
- [x] Dashboard Vite — `main.tsx` masterKey input, 5 routes: `/` Dashboard (providers 40, verify 314/316, requests avg ms, recent logs), `/models` 316 + filter `verified` + badge xanh/đỏ/vàng, `/providers` detailed + live health check, `/keys` CRUD `fgk-...` với scopes, `/logs` live SSE + polling
- [x] Test e2e: `POST /api/keys` master → `fgk-...`, `GET /api/keys` list 3, `POST /v1/chat/completions` pollinations với virtual key → `gpt-oss-20b`, scope violation `nvidia-nim` → 403, RPM 2 → 429 `Virtual key RPM limit 2 exceeded`, logs SSE, stats `byProvider`

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
| M2 | 2026-09-06 | P2 done: 30 adapters, streaming Gemini SSE, `auto` 15-tier → pollinations live, `x-router` pin |
| M3 | 2026-09-06 | P3 done: key-manager AES-GCM, quota RPM/TPM, breaker 5/30s, health live 40 (online 13) |
| M4 | 2026-09-06 | P4 done: virtual keys `fgk-...` CRUD + logs SSE + Dashboard 5 routes (models badges, keys, logs) |
| M5 | P5 (next) | Docker prod + Cloudflare + benchmark + OTel + AES rotation |

Gantt tham khảo trong `docs/ARCHITECTURE.md:1`.

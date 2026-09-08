# app-auto-llm-free

> **One endpoint for all free LLMs.** Like OmniRoute / 9Router / FreeLLMAPI — self-hosted, OpenAI-compatible, aggregating all free providers & models into a single gateway.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Stack: Hono + Node](https://img.shields.io/badge/Stack-Hono%20%2B%20Node-green)](https://hono.dev)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-00c853)](docs/en/API.md)
[![FREE](https://img.shields.io/badge/FREE-41_Providers-00c853?style=flat-square)](docs/en/PROVIDERS.md)
[![FREE](https://img.shields.io/badge/FREE-324_Models-00c853?style=flat-square)](models.yaml)
[![No Card](https://img.shields.io/badge/No_Card-29%2F30-3b82f6?style=flat-square)](docs/en/FREELLMS_FREE_TIER.md)

> ### 🆓 **100% FREE — No Credit Card • No Trial • Forever**
> **41 Providers • 324 Models (316 freellms free + 8 aliases) • One OpenAI-Compatible Endpoint** — Self-hosted, BYOK, costs you `$0`.
>
> | Tier | Providers | Models | No Card |
> |------|-----------|--------|---------|
> | **Permanent Free** | 26 — NVIDIA NIM **97**, ModelScope **43**, Cloudflare **35**, Gemini **15**, OVH **10**, Cohere **10**, OpenRouter **17**, SambaNova, Groq, Cerebras, Z AI, Agnes, Aion, LLM7… | 260+ | ✅ 29/30 |
> | **Quota Free** | 4 — GitHub Models **13**, Mistral **9**, Kilo Code **8**, HuggingFace **4** | 30+ | ✅ |
> | **Scraped / Unlimited** | 3 — Pollinations, LLM7.io, Ollama Cloud | 6 | ✅ |
> | **Custom Free** | 3 — OrcaRouter, FreeAI, Cline | 3 | ✅ |
>
> Smart routing `auto` → best free with fallback + `x-router` pin + 24h live verify. **If it's free out there, it's here.** → `POST /v1/chat/completions` with any OpenAI SDK. Full list: [docs/en/PROVIDERS.md](docs/en/PROVIDERS.md) • live probe: `POST /api/verify`

**Languages:** 🇬🇧 [English](README.md) | 🇻🇳 [Tiếng Việt](README.vi.md) | [Docs Index](docs/README.md) — Docs: [🇬🇧 EN](docs/en/GETTING_STARTED.md) | [🇻🇳 VI](docs/vi/GETTING_STARTED.md)

---

## 📸 Screenshots — Live Dashboard (30 providers • 316 free verified 24h)

| Providers — 41 IDs, tier, live health, `Get Key ↗` | Models — 324 (316 free + 8 aliases), live probe `Check Live`, `Hide 404` |
|:---:|:---:|
| ![Providers — 41 live, health 5s](docs/images/providers.png) | ![Models — 324 live verify](docs/images/models.png) |

| Dashboard — 4 cards + 3 charts + tokens overview | Logs — request log with charts + SSE stream |
|:---:|:---:|
| ![Dashboard — 4 cards + 3 charts + tokens](docs/images/dashboard.png) | ![Logs — charts + SSE](docs/images/logs.png) |

---

## ✨ Features

| Group | Details |
|------|----------|
| **Unified Endpoint** | `POST /v1/chat/completions` (stream + non-stream), `/v1/models`, `/v1/embeddings`, `/v1/images/generations` — works directly with OpenAI SDK |
| **Provider Hybrid (41 ids)** | **Permanent Free**: NVIDIA NIM (81 live), ModelScope, Cloudflare, Gemini (3.6), OVH, Cohere, SambaNova, SiliconFlow, Groq, Cerebras, Z AI, Agnes, Aion, LLM7, Chutes, Glhf… <br> **Quota**: GitHub Models, Mistral, Kilo Code, HuggingFace <br> **Scraped**: Pollinations, LLM7.io, Ollama Cloud — Source: live provider APIs (freellms.org snapshot disabled, not latest) |
| **Smart Routing** | Tiered fallback (real key → public free), aliases (`auto`/`gpt-4`/`glm`/`qwen`/`code` → best free), header `x-router`, skip `deprecated`/`quota`/`breaker`, `hasKey` filter |
| **Resilience** | Auto fallback, circuit breaker 5/30s half-open, TPM/RPM quota (NVIDIA 40, Groq 30), mid-stream SSE, token pre-flight, persisted 404 strikethrough |
| **Key Pool** | AES-256-GCM at-rest, BYOK, virtual keys `fgk-...` (scopes, RPM), `fgk-master-...` admin, `rotate-keys.ts` |
| **Dashboard (5 routes)** | Nav `Dashboard → Providers → Models → Keys → Logs` (header 2 rows, centered nav), **Dashboard** 4 cards + 3 charts + tokens, **Providers** pagination 25/50 sticky + `hasKey` filter (**default OFF**, `hasKeyOnly:0`) + `Sync Live Now` (shared `POST /api/models/live/sync` with Models) + `Get Key ↗` + live health, **Models** pagination 25/50 sticky + **Filters** dropdown (`hasKey` default OFF + `Hide 404`/`Hide credits`/`Hide invalid` default ON) + `Check Live (n)`/`Sync Live Now`/`Refresh` (Refresh resets `hasKeyOnly:false`, Check requires filter) + `Used/Limit` + strikethrough persist (`200 usable` keeps non-red after reload via `POST /api/models/health/mark`), **Keys** `fgk-...` CRUD + Key Generator + Quick Test, **Logs** charts + SSE |
| **Observability** | Pino pretty, OTel GenAI (`gen_ai.*`), token estimator, `request-log` 1000 + `X-Verified`, `PROVIDER_TEST_RESULTS` benchmark |

## 🏗️ Architecture

```
Client (OpenAI SDK / Vercel AI SDK) 
  → Hono Gateway (Node/Cloudflare Workers)
    → Middleware: auth, rate-limit, body-limit, logger
    → Smart Router (model → provider pool, sanitize spaces/colon)
    → Provider Adapters (OpenAI/Gemini/Anthropic/Scraped) + format-translator
    → Fallback + Retry + Circuit Breaker + persisted 404 skip
    → Normalizer → OpenAI SSE/JSON
  → Dashboard (Vite + React, i18n VI/EN) → /api/* → Drizzle ORM → SQLite/Postgres + Redis
```

See [docs/en/ARCHITECTURE.md](docs/en/ARCHITECTURE.md)

## 🚀 Quick Start — new users see **[GETTING_STARTED.md](docs/en/GETTING_STARTED.md) 5 min** (from 0 to first API call)

### Requirements
- Node >= 22 (`node -v`) + npm >= 10 (`npm -v`)
- Docker (recommended) or Redis + Postgres/SQLite

### 1. Clone & install

```bash
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free
cp .env.example .env
# No need to edit MASTER_KEY/ENCRYPTION_KEY — auto-generated on first boot and persisted to .env (or data/.gateway-keys.json)
# Provider keys (GROQ_API_KEYS...) can be empty — still runs via pollinations
# Check generated key: docker compose logs gateway | grep MASTER_KEY  or  cat .env | grep MASTER_KEY
```

### 2. Run with Docker (recommended)

```bash
docker compose up -d
# Gateway: http://localhost:7373
# Dashboard: http://localhost:3000
# Docs: http://localhost:7373/docs
```

### 3. Run dev locally

```bash
npm install
npm run dev:gateway   # Hono @ http://localhost:7373
npm run dev:web       # Vite @ http://localhost:5173
```

> **⚠️ After updating `.env` you must kill the old gateway and restart** — gateway reads `.env` only at boot (`config.ts:22`), `tsx watch` does **not** watch `.env`. See **Kill old process → restart** below.

#### 🔄 Kill old process & restart after `.env` change

**Docker (any OS):**
```bash
docker compose restart gateway
```

**macOS / Linux (npm):**
```bash
# kill tsx watch + any process on 7373, then restart
pkill -f "tsx watch"
lsof -ti:7373 | xargs kill -9
sleep 2
lsof -i :7373          # should be empty
npm run dev:gateway
```

**Windows (PowerShell — run as Administrator if needed):**
```powershell
# Find PID using port 7373 then kill it
netstat -ano | findstr :7373
taskkill /PID <PID> /F
# or kill all Node processes (closes all npm dev servers)
taskkill /F /IM node.exe

# alternative PowerShell one-liner
Stop-Process -Id (Get-NetTCPConnection -LocalPort 7373).OwningProcess -Force -ErrorAction SilentlyContinue
npm run dev:gateway
```

**Windows (Git Bash / CMD):**
```cmd
netstat -ano | findstr :7373
taskkill /PID <PID> /F
npm run dev:gateway
```

### 4. Call API (OpenAI SDK)

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:7373/v1",
  apiKey: "fgk-master-xxx", // auto-generated MASTER_KEY from .env/logs — also works for /v1/* single-key usage
  // or create scoped fgk-... in Dashboard /keys for per-app keys
});

const res = await client.chat.completions.create({
  model: "auto", // or "gpt-4", "gemini-3.6-flash", "llama-3.3-70b"
  messages: [{ role: "user", content: "Hello free gateway!" }],
  stream: false,
});
console.log(res.choices[0].message.content);

// Streaming
const stream = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Write a poem" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

Or `curl`:

```bash
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer fgk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":false}'

# Models: filter by provider / verified tier (live, not freellms)
curl "http://localhost:7373/v1/models?hasKey=1&limit=25" -H "Authorization: Bearer fgk-xxx"
curl "http://localhost:7373/api/models/live/sync" -X POST -H "Authorization: Bearer fgk-master-xxx"
```

## ⚙️ Configuration

See [.env.example](.env.example) and [docs/en/CONFIGURATION.md](docs/en/CONFIGURATION.md). Live sync see [docs/en/OPERATIONS.md](docs/en/OPERATIONS.md).

```env
PORT=7373
DATABASE_URL=file:./data.db          # or postgres://...
REDIS_URL=redis://localhost:6379
# MASTER_KEY / ENCRYPTION_KEY are optional — auto-generated on first boot if missing/placeholder
# MASTER_KEY=fgk-master-xxx   # single API key for /v1/* + /api/* (check logs or .env after first start)
# ENCRYPTION_KEY=64hex...      # internal AES-256-GCM, never exposed as API key
SYNC_INTERVAL_MS=86400000            # 24h verify live
DISABLE_SCHEDULER=0

# Provider keys (pool, comma-separated, live source)
GROQ_API_KEYS=gsk_xxx,gsk_yyy
GEMINI_API_KEYS=AIza_xxx,AIza_yyy
CEREBRAS_API_KEYS=csk_xxx
NVIDIA_API_KEYS=nvapi-xxx
# ... 30 providers, see .env.example
```

Create scoped virtual key (optional — MASTER_KEY already works for /v1/*):

```bash
curl -X POST http://localhost:7373/api/keys \
  -H "Authorization: Bearer fgk-master-xxx" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app","scopes":{"models":["*"],"providers":["*"]},"rpmLimit":60}'
# Or just use MASTER_KEY directly for single-key usage: Authorization: Bearer fgk-master-xxx
```

## 📚 Documentation

| Document | Description |
|----------|-------|
| [GETTING_STARTED.md](docs/en/GETTING_STARTED.md) | **For newcomers — 5 min** from 0 to first API call, Dashboard, common errors |
| [ARCHITECTURE.md](docs/en/ARCHITECTURE.md) | Architecture, request flow, provider interface |
| [PROVIDERS.md](docs/en/PROVIDERS.md) | List of **41 providers**, free tier limits, base URLs, how to add provider |
| [FREELLMS_FREE_TIER.md](docs/en/FREELLMS_FREE_TIER.md) | Freellms.org snapshot (historical) — live is now source of truth |
| [OPERATIONS.md](docs/en/OPERATIONS.md) | Operations & live verify (hasKey, Sync Live Now, persisted 404) |
| [API.md](docs/en/API.md) | OpenAI-compatible endpoints, aliases, streaming, error codes, pagination 25/50 |
| [CONFIGURATION.md](docs/en/CONFIGURATION.md) | Environment variables, models.yaml, rate limit |
| [DEPLOYMENT.md](docs/en/DEPLOYMENT.md) | Docker, Cloudflare Workers, Vercel, bare metal |
| [ROADMAP.md](docs/en/ROADMAP.md) | Roadmap P1→P5, milestones |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guide |

## 🗺️ Roadmap

- [x] **P1 Scaffold** — Hono + Vite + Drizzle + Docker (41 ids, live models, pagination 25/50)
- [x] **Freellms Sync** — Historical snapshot (now disabled, live is source)
- [x] **P2 Gateway Core** ✅ Done — 30 adapters, streaming SSE, `auto` 15-tier, `x-router` pin, sanitize spaces
- [x] **P3 Resilience** ✅ Done — key-manager AES-GCM, quota RPM/TPM, breaker 5/30s, health 41, persisted 404 strikethrough + disable
- [x] **P4 Auth + Dashboard** ✅ Done — `fgk-...` CRUD, rate-limit, request-log SSE, Dashboard 5 routes with hasKey + Hide 404 + Sync Live
- [x] **P5 Hardening** ✅ Done — `wrangler.jsonc`, Dockerfile prod, OTel, i18n VI/EN (UI + docs/vi docs/en)

See [docs/en/ROADMAP.md](docs/en/ROADMAP.md).

## 🤝 Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md). Please run `npm run lint` + `npm test` before push. Requires Node >= 22.

## 📜 License

Apache-2.0 — see [LICENSE](LICENSE).

---

**References**: [OmniRoute](https://github.com/diegosouzapw/OmniRoute) (271 providers), [9Router](https://github.com/decolua/9router), [Free LLM Gateway](https://github.com/MrFadiAi/free-llm-gateway) (24+ providers), [LiteLLM](https://github.com/BerriAI/litellm), [Hebo Gateway](https://github.com/8monkey-ai/hebo-gateway).

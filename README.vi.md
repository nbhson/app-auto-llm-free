# app-auto-llm-free

> **Một endpoint duy nhất cho mọi LLM miễn phí.** Tương tự OmniRoute / 9Router / FreeLLMAPI — tự host, OpenAI-compatible, gom toàn bộ provider & model free vào một gateway.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Stack: Hono + Node](https://img.shields.io/badge/Stack-Hono%20%2B%20Node-green)](https://hono.dev)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-00c853)](docs/vi/API.md)
[![MIỄN PHÍ](https://img.shields.io/badge/MIỄN_PHÍ-41_Provider-00c853?style=flat-square)](docs/vi/PROVIDERS.md)
[![MIỄN PHÍ](https://img.shields.io/badge/MIỄN_PHÍ-324_Model-00c853?style=flat-square)](models.yaml)
[![Không Cần Thẻ](https://img.shields.io/badge/Không_Cần_Thẻ-29%2F30-3b82f6?style=flat-square)](docs/vi/FREELLMS_FREE_TIER.md)

> ### 🆓 **100% MIỄN PHÍ — Không Cần Thẻ • Không Trial • Mãi Mãi**
> **41 Provider • 324 Model (316 free freellms + 8 alias) • Một Endpoint OpenAI-Compatible** — Tự host, BYOK, chi phí `$0`.
>
> | Nhóm | Provider | Model | Không cần thẻ |
> |------|----------|-------|--------------|
> | **Permanent Free (vĩnh viễn)** | 26 — NVIDIA NIM **97**, ModelScope **43**, Cloudflare **35**, Gemini **15**, OVH **10**, Cohere **10**, OpenRouter **17**, SambaNova, Groq, Cerebras, Z AI, Agnes, Aion, LLM7… | 260+ | ✅ 29/30 |
> | **Quota Free** | 4 — GitHub Models **13**, Mistral **9**, Kilo Code **8**, HuggingFace **4** | 30+ | ✅ |
> | **Scraped / Unlimited** | 3 — Pollinations, LLM7.io, Ollama Cloud | 6 | ✅ |
> | **Custom Free** | 3 — OrcaRouter, FreeAI, Cline | 3 | ✅ |
>
> Smart routing `auto` → model free tốt nhất + fallback + `x-router` pin + verify live 24h. **Cứ free ngoài kia là có ở đây.** → `POST /v1/chat/completions` với mọi OpenAI SDK. Full list: [docs/vi/PROVIDERS.md](docs/vi/PROVIDERS.md) • live probe: `POST /api/verify`

**Languages / Ngôn ngữ:** 🇻🇳 [Tiếng Việt](docs/vi/GETTING_STARTED.md) | 🇬🇧 [English](docs/en/GETTING_STARTED.md) | [Docs Index](docs/README.md)

---

## 📸 Screenshots — Dashboard Live (30 provider • 316 free verify 24h)

| Providers — 41 IDs, tier, live health, `Get Key ↗` | Models — 324 (316 free + 8 alias), live probe `Check Live`, `Hide 404` |
|:---:|:---:|
| ![Providers — 41 live, health 5s](docs/images/providers.png) | ![Models — 324 live verify](docs/images/models.png) |

---

## ✨ Tính năng

| Nhóm | Chi tiết |
|------|----------|
| **Unified Endpoint** | `POST /v1/chat/completions` (stream + non-stream), `/v1/models`, `/v1/embeddings`, `/v1/images/generations` — dùng trực tiếp với OpenAI SDK |
| **Provider Hybrid (30)** | **Permanent Free**: NVIDIA NIM (97), ModelScope (43), Cloudflare (35), Gemini (15), OVH (10), Cohere (10), SambaNova, SiliconFlow, Groq (7), Cerebras (5), Z AI, Agnes, Aion, LLM7, Chutes, Glhf… <br> **Quota**: GitHub Models (13), Mistral (9), Kilo Code (8), HuggingFace (4) <br> **Scraped**: Pollinations, LLM7.io, Ollama Cloud (3 free) — Nguồn: freellms.org (316 free models) |
| **Smart Routing** | Tiered 15 (real key → public free), alias (`auto`/`gpt-4`/`glm`/`qwen`/`code` → best free), header `x-router`, skip `deprecated`/`quota`/`breaker` |
| **Resilience** | Auto fallback 15 providers, circuit breaker 5/30s half-open, TPM/RPM quota (NVIDIA 40, Groq 30), mid-stream SSE, token pre-flight |
| **Key Pool** | AES-256-GCM at-rest, BYOK, virtual keys `fgk-...` (scopes, RPM), `fgk-master-...` admin, `rotate-keys.ts` |
| **Dashboard (5 routes)** | Nav `Dashboard → Providers → Models → Keys → Logs` (sticky, `providers` trước `models`), **Dashboard** 4 cards + 3 charts (byProvider/latency/verify) + tokens, **Providers** `Get Key ↗` + live health, **Models** 316 checkbox + `Check Live` + `Used/Limit`, **Keys** `fgk-...` CRUD + Key Generator (thay openssl) + Quick Test, **Logs** charts + SSE |
| **Vector 1+2 (2026-09-08)** | **Audio** `POST /v1/audio/transcriptions`/`translations`/`speech` (Groq/Cerebras/OpenAI, multipart) • **Responses** `POST /v1/responses` + `/v1/conversations` (Hebo, Open Responses API) • **Anthropic** `POST /v1/messages` (Anthropic ↔ OpenAI, streaming, `tool_use` ↔ `tool_calls`, `ANTHROPIC_API_KEYS`) • **Semantic Cache** (`SEMANTIC_CACHE_ENABLED=0`, `SEMANTIC_THRESHOLD=0.92`, `CACHE_TTL_S=3600`, `EMBEDDING_MODEL=cohere/embed-english-v3.0`, cosine, Redis/in-memory) • **Compression** (`COMPRESSION_ENABLED=0`, history/tools minify, 12-engine) • **Cost Routing** (`COST_ROUTING_ENABLED=0`, rẻ nhất trước) • **Analytics** (`ANALYTICS_RETENTION_DAYS=30`, `costByProvider`/`cacheHitRate`/`p95`, `GET /api/analytics/*`) |
| **Observability** | Pino pretty, OTel GenAI (`gen_ai.*`), token estimator, `request-log` 1000 + `X-Verified`, `PROVIDER_TEST_RESULTS` benchmark |

## 🏗️ Kiến trúc

```
Client (OpenAI SDK / Vercel AI SDK) 
  → Hono Gateway (Node/Cloudflare Workers)
    → Middleware: auth, rate-limit, body-limit, logger
    → Smart Router (model → provider pool)
    → Provider Adapters (OpenAI/Gemini/Anthropic/Scraped) + format-translator
    → Fallback + Retry + Circuit Breaker
    → Normalizer → OpenAI SSE/JSON
  → Dashboard (Vite + React) → /api/* → Drizzle ORM → SQLite/Postgres + Redis
```

**Pipeline Request (Vector 2) — `apps/gateway/src/routes/v1/chat.ts:105`:**
```
Client Request
  ↓
[Cost Routing?] — config.ts:163 COST_ROUTING_ENABLED=1 → lib/cost-router.ts:99 rankProvidersByCostAndLatency (FREELLMS_COST $/1M + latency EMA + quota headroom)
  ↓
[Semantic Cache?] — config.ts:158 SEMANTIC_CACHE_ENABLED=1 && !stream → lib/semantic-cache.ts:29 get(semantic:${model}:${sha256}) → hit → trả cache (200, X-Cache: HIT) + addLog cacheHit
  ↓
[Token Compression?] — config.ts:162 COMPRESSION_ENABLED=1 → lib/compression.ts:103 compressMessages (toolsMinify/historySummarize/codeDedup, ratio <0.95) → messagesToSend
  ↓
Gửi lên Upstream (Anthropic/OpenAI/Gemini...) → Fallback tiered + Circuit Breaker isOpen + checkQuota RPM/TPM/RPD/TPD
  ↓
Lưu kết quả vào cache (lib/semantic-cache.ts:58 set EX CACHE_TTL_S) + ghi analytics (request-log.ts:7 cost/cacheHit/compressedTokens, lib/analytics.ts:53)
  ↓
Trả về Client (OpenAI SSE/JSON + X-Provider/X-Verified + logGenAI otel.ts:10)
```
> Flow đúng như bạn mô tả: `Cost Routing → Semantic Cache → Compression → Upstream → Cache store + Analytics`. Code đã re-order `chat.ts:114` để cache check trước compression (chỉ nén khi miss). Toggle qua `Settings` `/settings` (localStorage `gatewaySettings`, default `.env` `GET /api/config`).

Chi tiết xem [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 🚀 Quick Start — người mới xem **[GETTING_STARTED.md](docs/GETTING_STARTED.md) 5 phút** (từ 0 tới gọi API đầu tiên)

### Yêu cầu
- Node >= 22 (`node -v`) + npm >= 10 (`npm -v`)
- Docker (khuyến nghị) hoặc Redis + Postgres/SQLite

### 1. Clone & cài đặt

```bash
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free
cp .env.example .env
# Không cần điền MASTER_KEY/ENCRYPTION_KEY — tự sinh lần đầu và lưu vào .env (hoặc data/.gateway-keys.json)
# Provider keys (GROQ_API_KEYS...) để trống vẫn chạy pollinations
# Xem key đã sinh: docker compose logs gateway | grep MASTER_KEY  hoặc  cat .env | grep MASTER_KEY
```

### 2. Chạy với Docker (khuyến nghị)

```bash
docker compose up -d
# Gateway: http://localhost:7373
# Dashboard: http://localhost:3000
# Docs: http://localhost:7373/docs
```

### 3. Chạy dev local

```bash
npm install
npm run dev:gateway   # Hono @ http://localhost:7373
npm run dev:web       # Vite @ http://localhost:5173
```

> **⚠️ Sau khi sửa `.env` phải kill gateway cũ rồi chạy lại** — gateway chỉ đọc `.env` lúc boot (`config.ts:22`), `tsx watch` **không** tự reload `.env`. Xem **Kill process cũ → restart** bên dưới.

#### 🔄 Kill process cũ & restart sau khi sửa `.env`

**Docker (mọi OS):**
```bash
docker compose restart gateway
```

**macOS / Linux (npm):**
```bash
pkill -f "tsx watch"
lsof -ti:7373 | xargs kill -9
sleep 2
lsof -i :7373          # phải trống
npm run dev:gateway
```

**Windows (PowerShell — chạy quyền Admin nếu cần):**
```powershell
netstat -ano | findstr :7373
taskkill /PID <PID> /F
# hoặc kill toàn bộ Node (đóng hết dev server npm)
taskkill /F /IM node.exe

# one-liner PowerShell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 7373).OwningProcess -Force -ErrorAction SilentlyContinue
npm run dev:gateway
```

**Windows (Git Bash / CMD):**
```cmd
netstat -ano | findstr :7373
taskkill /PID <PID> /F
npm run dev:gateway
```

### 4. Gọi API (OpenAI SDK)

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:7373/v1",
  apiKey: "fgk-master-xxx", // MASTER_KEY tự sinh trong .env/logs — dùng 1 key cho mọi endpoint, hoặc tạo fgk-... riêng ở /keys
});

const res = await client.chat.completions.create({
  model: "auto", // hoặc "gpt-4", "gemini-1.5-flash", "llama-3.3-70b"
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

Hoặc `curl`:

```bash
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer fgk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"stream":false}'

# Models: lọc theo provider / verified tier thực sự còn free (24h probe)
curl "http://localhost:7373/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx"
curl "http://localhost:7373/v1/models?provider=nvidia-nim&verified=free" -H "Authorization: Bearer fgk-xxx"
curl "http://localhost:7373/api/verify/summary" -H "Authorization: Bearer fgk-master-xxx"
```

## ⚙️ Cấu hình

Xem [.env.example](.env.example) và [docs/CONFIGURATION.md](docs/CONFIGURATION.md). Sync 24h xem [docs/OPERATIONS.md](docs/OPERATIONS.md).

```env
PORT=7373
DATABASE_URL=file:./data.db          # hoặc postgres://...
REDIS_URL=redis://localhost:6379
# MASTER_KEY / ENCRYPTION_KEY tự sinh nếu thiếu/placeholder — không bắt buộc nhập tay
# MASTER_KEY=fgk-master-xxx   # 1 key duy nhất cho /v1/* + /api/* (xem logs hoặc .env sau lần chạy đầu)
# ENCRYPTION_KEY=64hex...      # key nội bộ AES-256-GCM, không dùng làm API key
SYNC_INTERVAL_MS=86400000            # 24h verify live
DISABLE_SCHEDULER=0

# Provider keys (pool, phân tách bằng dấu phẩy, 30 providers freellms)
GROQ_API_KEYS=gsk_xxx,gsk_yyy
GEMINI_API_KEYS=AIza_xxx,AIza_yyy
CEREBRAS_API_KEYS=csk_xxx
NVIDIA_API_KEYS=nvapi-xxx
# ... 30 providers, xem .env.example đầy đủ
```

Tạo virtual key có scope (tùy chọn — MASTER_KEY đã dùng được cho /v1/*):

```bash
curl -X POST http://localhost:7373/api/keys \
  -H "Authorization: Bearer fgk-master-xxx" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app","scopes":{"models":["*"],"providers":["*"]},"rpmLimit":60}'
# Hoặc dùng luôn MASTER_KEY cho single-key: Authorization: Bearer fgk-master-xxx
```

## 📚 Tài liệu

| Tài liệu | Mô tả |
|----------|-------|
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | **Cho người mới — 5 phút** từ 0 tới gọi API đầu tiên, Dashboard, lỗi thường gặp |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Chi tiết kiến trúc, luồng request, provider interface |
| [PROVIDERS.md](docs/PROVIDERS.md) | Danh sách **30 providers (freellms)**, free tier limits, base URLs, cách thêm provider |
| [FREELLMS_FREE_TIER.md](docs/FREELLMS_FREE_TIER.md) | Scan freellms.org 2026-09-06 — 316 free models, ranking, rate limits |
| [OPERATIONS.md](docs/OPERATIONS.md) | Vận hành & xác thực free tier 24h (live verify vs freellms, scheduler, cron) |
| [API.md](docs/API.md) | Đặc tả OpenAI-compatible endpoints, alias, streaming, error codes |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | Biến môi trường (30 providers), models.yaml, rate limit |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker, Cloudflare Workers, Vercel, bare metal |
| [ROADMAP.md](docs/ROADMAP.md) | Lộ trình P1→P5, milestones |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Quy trình đóng góp |

## 🗺️ Roadmap

- [x] **P1 Scaffold** — Hono + Vite + Drizzle + Docker (30 providers, 316 models registry)
- [x] **Freellms Sync** — Scan freellms.org, `data/*.json` + `models.yaml` (316 free) + `scripts/sync-freellms.py`
- [x] **P2 Gateway Core** ✅ Done 2026-09-06 — 30 adapters, streaming SSE (Gemini `alt=sse` → OpenAI), tool calling, `auto` 15-tier → pollinations live, `x-router` pin
- [x] **P3 Resilience** ✅ Done 2026-09-06 — key-manager AES-GCM, quota RPM/TPM (NVIDIA 40/Groq 30/Cerebras 15/1M), breaker 5/30s, `GET /api/providers/health` live 41, `X-Verified` + deprecated skip
- [x] **P4 Auth + Dashboard** ✅ Done 2026-09-06 — `fgk-...` CRUD (hash SHA256, scopes, RPM), `rate-limit` virtual key, `request-log` SSE, Dashboard 5 routes (Dashboard verify, Models badges, Providers health, Keys CRUD, Logs live)
- [x] **P5 Hardening** ✅ Done 2026-09-06 — `wrangler.jsonc` Cloudflare, Dockerfile prod non-root + HEALTHCHECK, `otel.ts` GenAI, `secureHeaders` + `bodyLimit`, `benchmark.ts` + `PROVIDER_TEST_RESULTS.md` (online 13/40, chat 1539ms), `rotate-keys.ts` AES rotation, `SECURITY.md` hardening checklist
- [x] **P6 Vector 1+2** ✅ Done 2026-09-08 — `/v1/audio/*` (transcriptions/translations/speech) + `/responses`/`/conversations` (Hebo) + `/v1/messages` (Anthropic) + semantic cache (`SEMANTIC_CACHE_ENABLED`/`SEMANTIC_THRESHOLD=0.92`/`CACHE_TTL_S=3600`/`cohere/embed-english-v3.0`) + compression (`COMPRESSION_ENABLED`) + cost routing (`COST_ROUTING_ENABLED`) + analytics (`costByProvider`/`cacheHitRate`/`p95`, `ANALYTICS_RETENTION_DAYS=30`)

Chi tiết [docs/ROADMAP.md](docs/ROADMAP.md).

## 🤝 Đóng góp

PRs welcome! Xem [CONTRIBUTING.md](CONTRIBUTING.md). Vui lòng chạy `npm run lint` + `npm test` trước khi push. Yêu cầu Node >= 22.

## 📜 License

Apache-2.0 — xem [LICENSE](LICENSE).

---

**Tham khảo**: [OmniRoute](https://github.com/diegosouzapw/OmniRoute) (271 providers), [9Router](https://github.com/decolua/9router), [Free LLM Gateway](https://github.com/MrFadiAi/free-llm-gateway) (24+ providers), [LiteLLM](https://github.com/BerriAI/litellm), [Hebo Gateway](https://github.com/8monkey-ai/hebo-gateway).

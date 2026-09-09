> **English** | [🇻🇳 Tiếng Việt](../vi/GETTING_STARTED.md) | [Docs Index](../README.md)

# Getting Started (5 Minutes)

> For first-time gateway users — no coding knowledge required, just copy and paste the commands.

## 1. What Do You Need?

- **Docker Desktop** (recommended) **or** Node >= 22 (`node -v`) + npm >= 10 (`npm -v`)
- **No manual key generation:** `MASTER_KEY` (single API key for `/v1/*` + `/api/*`) and `ENCRYPTION_KEY` (internal AES-256-GCM) are **auto-generated** on first boot if missing/placeholder and persisted to `.env` (or `data/.gateway-keys.json` when running Docker without `.env`) — check `docker compose logs gateway | grep MASTER_KEY`.
- **Provider keys are optional:** you can leave them empty and still run `pollinations` (20b) via `auto`. With real keys you get live models via `?hasKey=1` (live sync 882 free).
- **Docs:** Root `README.md` default English, `README.vi.md` Vietnamese; you are in `docs/en/` (English banner). UI has `VI/EN` selector in header (persists `localStorage lang`) — `lib/i18n.tsx:1`.

## 2. Quick Setup (Docker) — 2 Commands

```bash
# 1. Clone the code
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free

# 2. Create the config file (no need to edit keys — auto-generated)
cp .env.example .env
# Leave GROQ_API_KEYS, GEMINI_API_KEYS... empty if you don't have them — gateway still runs.

# 3. Run
docker compose up -d --build
docker compose logs -f gateway   # wait for "🚀 Gateway listening on http://localhost:7373" + "Auto-generated MASTER_KEY=fgk-master-..."

# Verify
curl http://localhost:7373/v1/health
# Get the auto-generated MASTER_KEY (single key for /v1/* + /api/*)
grep MASTER_KEY .env
# or: docker compose logs gateway | grep MASTER_KEY
```

Open the Dashboard: **http://localhost:3000** — **2-row header** `max-w-[1440px]` wider center (`lg:px-6`): row 1 left `⚡ Free LLM Gateway • 30 providers • 316 free` + `● online`, right `VI/EN` + **Master editable input** (password/text toggle + Show/Copy, auto-filled from `GET /api/bootstrap` on first start, always admin) — edit inline if needed; row 2 centered nav `Dashboard→Providers→Models→Keys→Logs`. `ENCRYPTION_KEY` is internal — auto-generated. To rotate, open **Keys → Key Generator** (collapsed by default).

> To use your own keys, edit `MASTER_KEY`/`ENCRYPTION_KEY` in `.env` before `compose up`. Fresh clone has empty `data/` (only `.gitkeep` — see `b930e6d`); run **Sync Live Now** on `/providers` or `/models` (`POST /api/models/live/sync {freeOnly:true}`) to populate `data/live-models.json` after adding real provider keys.

## 3. Setup Without Docker (Node)

```bash
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free
cp .env.example .env
# no need to edit MASTER_KEY/ENCRYPTION_KEY — auto-generated
npm install
npm run build
npm run dev:gateway   # http://localhost:7373 — check log Auto-generated MASTER_KEY
npm run dev:web       # http://localhost:5173 (in another tab)
# Get key: grep MASTER_KEY .env
```

## 4. Use Your Single API Key

`MASTER_KEY` (auto-generated in `.env`) already works for **all** endpoints `/v1/*` + `/api/*` — no need to create `fgk-...`. Create `fgk-...` only for per-app scoped keys.

**Single-key usage (recommended for dev):**

```bash
MASTER=$(grep MASTER_KEY .env | cut -d= -f2) # or from docker logs
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'
```

**Create scoped fgk-... (optional):**

*Dashboard:* Open http://localhost:3000/keys → Master field already filled → Name `my-app`, Scopes `{"models":["*"],"providers":["*"]}`, RPM `60` → **Create** → copy `fgk-...` (shown once).

*curl:*

```bash
MASTER=fgk-master-xxx... # from .env
curl -X POST http://localhost:7373/api/keys \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app","scopes":{"models":["*"],"providers":["*"]},"rpmLimit":60}'
# -> {"key":"fgk-...","id":"vk-..."}
# Narrow: -d '{"name":"pollinations-only","scopes":{"models":["*"],"providers":["pollinations"]}}'
```

Narrow scope example — pollinations only:

```bash
-d '{"name":"pollinations-only","scopes":{"models":["*"],"providers":["pollinations"]}}'
```

## 5. Try the API (3 Ways)

### a) curl

```bash
KEY=fgk-... # just created
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'

# Pin a provider (no provider key needed if it is public)
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "x-router: pollinations" \
  -H "Content-Type: application/json" \
  -d '{"model":"pollinations/openai","messages":[{"role":"user","content":"Hi"}],"stream":false}'

# Streaming
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"haiku"}],"stream":true}'

# Models that are still actually free — live cache (not freellms)
curl "http://localhost:7373/v1/models?hasKey=1&limit=25" -H "Authorization: Bearer $KEY" | head -c 500
# Freellms snapshot (historical)
curl "http://localhost:7373/v1/models?verified=free&q=gemma&page=1&limit=25" -H "Authorization: Bearer $KEY" | head -c 500
# Providers with real keys
curl "http://localhost:7373/api/providers?hasKey=1&q=nvidia" -H "Authorization: Bearer $MASTER" | jq
```

### b) OpenAI SDK (Node)

```ts
import OpenAI from "openai";
const client = new OpenAI({ baseURL:"http://localhost:7373/v1", apiKey:"fgk-..." });
const r = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"Hello"}] });
console.log(r.choices[0].message.content);
// Streaming
const s = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"haiku"}], stream:true });
for await(const c of s) process.stdout.write(c.choices[0]?.delta?.content||"");
// List models hasKey + pagination
const models = await (client as any).models.list({ hasKey: 1, limit: 25 });
```

### c) OpenAI SDK (Python)

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:7373/v1", api_key="fgk-...")
print(client.chat.completions.create(model="auto", messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
```

## 6. Add Provider Keys (Optional, to Use Live 882 Free)

Without keys → `auto` still falls back to `pollinations` (20b) after ~10s and responds. To use a specific model (e.g. `nvidia-nim/z-ai/glm-5.2`):

1. Go to freellms.org/providers/nvidia-nim → **Get API Key** → create `nvapi-...`
2. Paste it into `.env` on the `NVIDIA_API_KEYS=nvapi-...` line (multiple keys separated by `,`) — real-key needs `length>20` and not `xxx`/`change-me` for `hasRealKey` `api.ts:27`
3. **Restart gateway to reload `.env`** (gateway reads `.env` only at boot `config.ts:22`, `tsx watch` does **not** watch `.env`):
   - **Docker (any OS):** `docker compose restart gateway`
   - **macOS / Linux (npm):**
     ```bash
     pkill -f "tsx watch"
     lsof -ti:7373 | xargs kill -9
     sleep 2
     lsof -i :7373   # should be empty
     npm run dev:gateway
     ```
   - **Windows PowerShell (run as Administrator if needed):**
     ```powershell
     netstat -ano | findstr :7373
     taskkill /PID <PID> /F
     # or kill all Node dev servers
     taskkill /F /IM node.exe
     # one-liner
     Stop-Process -Id (Get-NetTCPConnection -LocalPort 7373).OwningProcess -Force -ErrorAction SilentlyContinue
     npm run dev:gateway
     ```
   - **Windows CMD / Git Bash:**
     ```cmd
     netstat -ano | findstr :7373
     taskkill /PID <PID> /F
     npm run dev:gateway
     ```
4. Sync live: click **Sync Live Now** on `/providers` or `/models` (both call `POST /api/models/live/sync {freeOnly:true}` `sync-live-models.ts:17` → `provider.models()` → `data/live-models.json`) or `curl -X POST /api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'` — then `GET /v1/models?hasKey=1` returns live cache, `GET /api/providers?hasKey=1` highlights green
5. Check `GET /api/providers/health` — that provider will switch to `online`, and `GET /api/verify/summary` will increase `verified_free`

Table of 30 providers + key links: see `docs/PROVIDERS.md:1` (column **Base URL**).

## 7. Dashboard Walkthrough (nav: Dashboard → Providers → Models → Keys → Logs, 2-row header)

- **2-row Header** (`main.tsx:40`) `max-w-[1440px]` wider (`lg:px-6`): Row 1 left `⚡ Free LLM Gateway` + `● online/offline` + `30 providers • 316 free`, right `VI/EN` + **Master editable input** (password/text toggle + Show/Copy, auto-filled from `GET /api/bootstrap` if localStorage is placeholder, re-bootstrap on 401) — editable inline; Row 2 centered nav 5 tabs `Dashboard→Providers→Models→Keys→Logs` (`alignSelf: center`, `borderRadius:10`). Language persists in `localStorage lang`, translates nav + Models/Providers (`lib/i18n.tsx`). Bootstrap disabled by default (`EXPOSE_BOOTSTRAP=0`); enable locally with `EXPOSE_BOOTSTRAP=1` for first-time auto-bind (`app.ts:23`). Fresh clone `data/` is empty (`.gitkeep` only) — use **Sync Live Now** to populate.
- **`/` Dashboard** — 4 cards: Providers 41, Verify 314/316, Requests, **Tokens** (all-time + last 100 prompt/completion). Right below is **Quick Guideline** 3 steps (gradient `slate-900`, button `Go to Keys`): `1 Auto MASTER_KEY` → `2 Create fgk-...` → `3-4 Copy & Quick Test`. Then 3 charts: **Requests by Provider**, **Latency**, **Verify Pie** + Recent Logs (5) + **Tokens by Provider** bar. **Gateway Health & Stats Detail** moved to **right sidebar** (button `Gateway Health & Stats Detail` opens drawer `w-[520px]`, backdrop, Copy JSON).
- **`/providers`** — 41 rows, `Free`, `Keys` (`✓ real` green when `hasRealKey` `k.length>20 && !xxx`), **Health** (`online`/`offline`/`no-key` + `breaker`), **Caps**, **Get Key ↗** (direct link to provider console + freellms). Rows with hasRealKey highlighted `background #f0fdf4`, `borderLeft 3px #16a34a`, badge `● has key` green. Top filter: `q` search (400ms debounce) + pill `Only with keys` (hasKey, default OFF), **sticky bottom pagination** `‹ Prev / Next ›` + `Page X/Y` + `LOV 25/50`. **Sync Live Now** (same `POST /api/models/live/sync` as Models, writes `data/live-models.json`, then `POST /api/verify`) + **Live Health Check** 41 providers in 5s. After `.env` change must **restart gateway** to see `hasKey` green.
- **`/models`** — Live `882 free` / freellms `316 free`, **single filter row**: `Filter id` + `Filter provider` + `Verified` + **Filters** dropdown (right next to Verified, 4 toggles: `hasKey` **default OFF** `hasKeyOnly:0` + `Hide 404` / `Hide credits` / `Hide invalid ID` default ON) + **top-right 3 buttons** `Check Live (n)` (requires `Filter id` or `provider`, pick checkboxes first) — `Sync Live Now` (same `POST /api/models/live/sync` as Providers, `freeOnly:true`, writes `data/live-models.json`) — `Refresh` (clears `q`/`provider`/`verified`, resets `hasKeyOnly:false` + 3 `hide*` true, does not auto-enable `hasKey`); checkbox per row + header select-all (disabled when `isInvalidId`), **Used / Limit** (logs vs `Up to 40 RPM`), **Live** `usable/no-key/402/404/410` (per-row `Check` `GET /api/models/health?model=` → `POST /api/models/health/mark {status:"usable",http_status:200}` persists `data/model-health.json` so reload stays non-red, `isRowDisabled` prioritizes `live usable`/`usage>0` over `deprecated`). `Hide invalid ID` filters ids without `/` or with spaces/illegal chars (alias `auto` excluded).
- **`/keys`** — **4-step wizard**: `1 Key Generator` (optional, **collapsed by default**, click to expand) → `2 Create fgk-...` (Name/RPM/Scopes + Create) → `3 Copy key` (amber banner shown once after Create, with `Copy Key`) → `4 Quick Test` (`curl` auto + `x-router: pollinations`). **Table Your Keys** at **bottom** (after Quick Test), not in middle, to keep flow uninterrupted.
- **`/logs`** — 3 charts: **Requests by Provider** + **Tokens by Provider** + **Status Pie**, header `total • allTimeTokens • avg ms/tok`, logs table + **Live ON** (SSE + 2s poll, duplicate `Auto sync 5s` removed).

## 8. Common Errors

> **Node 22–26 & `better-sqlite3`**: gateway uses `better-sqlite3@^13.0.3` (`apps/gateway/package.json:34`) with prebuilds for Node 22–26 (ABI 127–147). Requires **Node >= 22**. If `npm install` fails with `gyp ERR!` / `v8-internal.h: concept/requires`, run `rm -rf node_modules package-lock.json && npm install` after upgrading to Node 22 LTS — Docker (`node:22-alpine`) is unaffected.

| Error | Cause | Fix |
|-----|-------|-----|
| `401 Invalid API key` | Wrong `fgk-...` or missing `MASTER_KEY` | Use `MASTER_KEY` from `.env` for `/v1/*` (single-key) or create `fgk-...` at `/keys` |
| `403 Admin required` on `POST /api/keys` | Using a user `fgk-...` instead of `MASTER_KEY` | Use `MASTER_KEY` for `/api/keys` POST/DELETE |
| `403 Key not allowed for provider nvidia-nim` | Key scope is only `pollinations` but `x-router: nvidia-nim` was sent | Create a key with `providers: ["*"]` or `["nvidia-nim"]` |
| `429 Virtual key RPM limit 2 exceeded` | `rpmLimit` is small and you called too quickly / typed search continuously | Fixed: search debounced 400ms + list endpoints 4x (200) in `middleware/rate-limit.ts`; if still 429 create key with `rpmLimit: 60` or wait 60s |
| `404 page not found` from `nvidia-nim` | Missing `NVIDIA_API_KEYS` or placeholder `xxx` | Add real key (`!xxx`, length>20) or use `x-router: pollinations`; check `GET /api/providers?hasKey=1` |
| `Only 7 models` | Running old `npm run dev:gateway` without rebuilding after the `paths.ts` fix | `git pull && npm run build -w apps-gateway && docker compose up -d --build` + hard reload `Ctrl+Shift+R` |
| `Hide 404 not hiding` | model-health not persisted | Tick checkbox then Check Live 410 → persists to `data/model-health.json`; toggle `Hide 404 models` default checked |
| `verified 0/316` | Missing real provider keys, scheduler not yet run | Wait 5s after starting the gateway (scheduler auto-verifies + syncLiveModels dry-run) or `POST /api/verify` / `POST /api/models/live/sync` with `{"freeOnly":true}` — `ENCRYPTION_KEY` is auto-generated, no manual step |
| `npm i` fails `better-sqlite3` / `node-gyp` / `v8-internal.h: concept` | Node 26 + old `better-sqlite3@9` has no prebuild (ABI 147) | Fixed at `^13.0.3`: `rm -rf node_modules package-lock.json && npm i`. If still fails, use Node 22 LTS (`brew install node@22`) or `npm i --build-from-source` with Xcode CLT `xcode-select --install` |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN` | Behind corporate SSL-inspection proxy (Zscaler) | Dev: uncomment `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env` (commented by default), prod: use `NODE_EXTRA_CA_CERTS=/path/to/ca.crt` to keep verification |
| `EADDRINUSE :::7373` on `npm run dev` | Old gateway still running (`nohup npm run dev:gateway` or `tsx watch` not killed) | **macOS/Linux:** `pkill -f "tsx watch"; lsof -ti:7373 \| xargs kill -9; sleep 2; lsof -i :7373` (empty) then `npm run dev` <br> **Windows PowerShell:** `netstat -ano \| findstr :7373` → `taskkill /PID <PID> /F` or `taskkill /F /IM node.exe` <br> **Windows CMD/Git Bash:** same `netstat` + `taskkill` |

## 9. Useful Commands

```bash
# Kill old gateway if EADDRINUSE :::7373
# macOS / Linux:
pkill -f "tsx watch"; lsof -ti:7373 | xargs kill -9; sleep 2; lsof -i :7373
# Windows PowerShell:
# netstat -ano | findstr :7373
# taskkill /PID <PID> /F
# taskkill /F /IM node.exe
# Stop-Process -Id (Get-NetTCPConnection -LocalPort 7373).OwningProcess -Force

# Health
curl http://localhost:7373/v1/health
curl http://localhost:7373/api/providers/health -H "Authorization: Bearer $MASTER"
curl "http://localhost:7373/api/providers?hasKey=1&q=nvidia" -H "Authorization: Bearer $MASTER"

# Verify 24h + Live sync (new source of truth)
curl http://localhost:7373/api/verify/summary -H "Authorization: Bearer $MASTER"
curl -X POST http://localhost:7373/api/verify -H "Authorization: Bearer $MASTER" -d '{"dryRun":true}'
curl http://localhost:7373/api/models/live -H "Authorization: Bearer $MASTER" | jq '.total'
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}' | jq

# Models live vs freellms
curl "http://localhost:7373/v1/models?hasKey=1&limit=25&q=gemma" -H "Authorization: Bearer $MASTER" | jq '.pagination'
curl "http://localhost:7373/v1/models?verified=free" -H "Authorization: Bearer $fgk" | head -c 500

# Logs & stats
curl "http://localhost:7373/api/logs?limit=5" -H "Authorization: Bearer $MASTER"
curl http://localhost:7373/api/stats -H "Authorization: Bearer $MASTER"

# Persisted 404
curl http://localhost:7373/api/models/health/persisted -H "Authorization: Bearer $MASTER" | jq

# Manual freellms sync (historical, disabled — use live sync instead)
python scripts/sync-freellms.py
npm run verify:free:dry -w apps-gateway
npx tsx scripts/benchmark.ts --gateway http://localhost:7373 --key $MASTER

# Rotate MASTER_KEY / ENCRYPTION_KEY (optional — auto-generated, only when needed)
grep MASTER_KEY .env
# Or generate new: openssl rand -hex 32 ; echo "fgk-master-$(openssl rand -hex 16)"
npx tsx scripts/rotate-keys.ts --old $OLD --new $NEW
```

Need more help? Open an Issue with your `curl` command + `docker compose logs` + `GET /api/verify/summary` + `GET /api/models/live`.

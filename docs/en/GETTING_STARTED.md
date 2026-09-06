> **English** | [🇻🇳 Tiếng Việt](../vi/GETTING_STARTED.md) | [Docs Index](../README.md)

# Getting Started (5 Minutes)

> For first-time gateway users — no coding knowledge required, just copy and paste the commands.

## 1. What Do You Need?

- **Docker Desktop** (recommended) **or** Node 20+ (`node -v`)
- **2 self-generated keys** (no provider signup required):
  - `MASTER_KEY` — gateway admin key (you choose it, e.g. `fgk-master-...`)
  - `ENCRYPTION_KEY` — 64 hex characters for encryption (generated with one command)
- **Provider keys are optional:** you can leave them empty and still run `pollinations` (20b) via `auto`.

## 2. Quick Setup (Docker) — 3 Commands

```bash
# 1. Clone the code
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free

# 2. Create the config file
cp .env.example .env

# 3. Generate the 2 required keys (run each command, copy the result into .env)
openssl rand -hex 32
# -> e.g. a1b2c3...64 characters, paste into the ENCRYPTION_KEY= line in .env

echo "fgk-master-$(openssl rand -hex 16)"
# -> e.g. fgk-master-8f3a9c... , paste into the MASTER_KEY= line in .env

# Without openssl (Windows): use Node
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('fgk-master-'+require('crypto').randomBytes(16).toString('hex'))"
```

Open `.env` in Notepad/VS Code and replace these 2 lines:

```
MASTER_KEY=fgk-master-xxx... (the one you just generated)
ENCRYPTION_KEY=a1b2...64 hex (the one you just generated)
```

Leave lines like `GROQ_API_KEYS`, `GEMINI_API_KEYS`... empty if you don't have them yet — the gateway will still run.

```bash
# 4. Run
docker compose up -d --build
docker compose logs -f gateway   # wait for "🚀 Gateway listening on http://localhost:8080"

# Verify
curl http://localhost:8080/v1/health
```

Open the Dashboard: **http://localhost:3000** — enter the `MASTER_KEY` you just created into the **Master** field at the top-right header (saved to localStorage). Or use Dashboard → **Key Generator** to generate it directly (no `openssl` needed).

## 3. Setup Without Docker (Node)

```bash
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free
cp .env.example .env
# edit MASTER_KEY + ENCRYPTION_KEY as above
npm install
npm run build
npm run dev:gateway   # http://localhost:8080
npm run dev:web       # http://localhost:5173 (in another tab)
```

## 4. Create Your First API Key (`fgk-...`)

**Option 1 — Dashboard (easiest):**

1. Open http://localhost:3000/keys
2. Enter `MASTER_KEY` in the header (if not already set)
3. Name: `my-app` — Scopes: `{"models":["*"],"providers":["*"]}` — RPM: `60` → **Create**
4. Copy the `fgk-...` that appears (shown only once!)

**Option 2 — curl:**

```bash
MASTER=fgk-master-xxx... # from .env
curl -X POST http://localhost:8080/api/keys \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app","scopes":{"models":["*"],"providers":["*"]},"rpmLimit":60}'
# -> {"key":"fgk-...","id":"vk-..."}
```

Narrow scope example — pollinations only:

```bash
-d '{"name":"pollinations-only","scopes":{"models":["*"],"providers":["pollinations"]}}'
```

## 5. Try the API (3 Ways)

### a) curl

```bash
KEY=fgk-... # just created
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'

# Pin a provider (no provider key needed if it is public)
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "x-router: pollinations" \
  -H "Content-Type: application/json" \
  -d '{"model":"pollinations/openai","messages":[{"role":"user","content":"Hi"}],"stream":false}'

# Streaming
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"haiku"}],"stream":true}'

# Models that are still actually free (24h probe)
curl "http://localhost:8080/v1/models?verified=free" -H "Authorization: Bearer $KEY" | head -c 500
```

### b) OpenAI SDK (Node)

```ts
import OpenAI from "openai";
const client = new OpenAI({ baseURL:"http://localhost:8080/v1", apiKey:"fgk-..." });
const r = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"Hello"}] });
console.log(r.choices[0].message.content);
// Streaming
const s = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"haiku"}], stream:true });
for await(const c of s) process.stdout.write(c.choices[0]?.delta?.content||"");
```

### c) OpenAI SDK (Python)

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="fgk-...")
print(client.chat.completions.create(model="auto", messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
```

## 6. Add Provider Keys (Optional, to Use All 316 Models)

Without keys → `auto` still falls back to `pollinations` (20b) after ~10s and responds. To use a specific model (e.g. `nvidia-nim/z-ai/glm-5.2`):

1. Go to freellms.org/providers/nvidia-nim → **Get API Key** → create `nvapi-...`
2. Paste it into `.env` on the `NVIDIA_API_KEYS=nvapi-...` line (multiple keys separated by `,`)
3. `docker compose restart gateway` or restart `npm run dev:gateway`
4. Check `GET /api/providers/health` — that provider will switch to `online`, and `GET /api/verify/summary` will increase `verified_free`

Table of 30 providers + key links: see `docs/PROVIDERS.md:1` (column **Base URL**).

## 7. Dashboard Walkthrough (nav: Dashboard → Providers → Models → Keys → Logs)

- **`/` Dashboard** — 4 cards: Providers 40, Verify 314/316, Requests, **Tokens** (all-time + last 100 prompt/completion). Below are 3 charts: **Requests by Provider**, **Latency**, **Verify Pie** + Recent Logs (5) + **Tokens by Provider** bar. Header has `MASTER_KEY` input + `Key Generator` (now moved to **Keys**).
- **`/providers`** — 43 rows, `Free`, `Keys`, **Health** (`online`/`offline`/`no-key` + `breaker`), **Caps**, **Get Key ↗** column (direct link to provider console + freellms). **Live Health Check** button for all 43 providers in 5s.
- **`/models`** — 316 free, filter by `id/provider` (e.g. `nvidia-nim`), `verified` (green/red/yellow), **checkbox** per row + header select-all, **single button** `Check Live (n)` for ticked models (shows `✅ usable 123ms`/`no-key`/`unusable 410`), **Used / Limit** column (counted from logs vs `Up to 40 RPM`).
- **`/keys`** — **Key Generator** (replaces `openssl`) at the top (Generate `MASTER_KEY`/`ENCRYPTION_KEY` client-side), below is CRUD for `fgk-...` (name/scopes/RPM) + **Quick Test** `curl` with `$FGK_KEY` (auto + `x-router: pollinations`).
- **`/logs`** — 3 charts: **Requests by Provider** + **Tokens by Provider** + **Status Pie**, header `total • allTimeTokens • avg ms/tok`, logs table + Live SSE.

## 8. Common Errors

| Error | Cause | Fix |
|-----|-------|-----|
| `401 Invalid API key` | Using `MASTER_KEY` for `/v1/chat/completions` instead of `fgk-...`, or `fgk-...` not yet created | Create a new key at `/keys` and use that `fgk-...` for `/v1/*` |
| `403 Admin required` on `POST /api/keys` | Using a user `fgk-...` instead of `MASTER_KEY` | Use `MASTER_KEY` for `/api/keys` POST/DELETE |
| `403 Key not allowed for provider nvidia-nim` | Key scope is only `pollinations` but `x-router: nvidia-nim` was sent | Create a key with `providers: ["*"]` or `["nvidia-nim"]` |
| `429 Virtual key RPM limit 2 exceeded` | `rpmLimit` is small and you called too quickly | Create a new key with `rpmLimit: 60` or wait 60s |
| `404 page not found` from `nvidia-nim` | Missing `NVIDIA_API_KEYS` | Add the key or use `x-router: pollinations` to test without a key |
| `Only 7 models` | Running old `npm run dev:gateway` without rebuilding after the `paths.ts` fix | `git pull && npm run build -w apps-gateway && docker compose up -d --build` + hard reload `Ctrl+Shift+R` |
| `verified 0/316` | Missing `ENCRYPTION_KEY`/provider keys, scheduler not yet run | Wait 5s after starting the gateway (scheduler auto-verifies with dry-run) or `POST /api/verify` with `{"dryRun":true}` |

## 9. Useful Commands

```bash
# Health
curl http://localhost:8080/v1/health
curl http://localhost:8080/api/providers/health -H "Authorization: Bearer $MASTER"

# Verify 24h
curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer $MASTER"
curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer $MASTER" -d '{"dryRun":true}'

# Logs & stats
curl "http://localhost:8080/api/logs?limit=5" -H "Authorization: Bearer $MASTER"
curl http://localhost:8080/api/stats -H "Authorization: Bearer $MASTER"

# Manual freellms sync
python scripts/sync-freellms.py
npm run verify:free:dry -w apps-gateway
npx tsx scripts/benchmark.ts --gateway http://localhost:8080 --key $MASTER

# Rotate MASTER_KEY / ENCRYPTION_KEY
openssl rand -hex 32
echo "fgk-master-$(openssl rand -hex 16)"
npx tsx scripts/rotate-keys.ts --old $OLD --new $NEW
```

Need more help? Open an Issue with your `curl` command + `docker compose logs` + `GET /api/verify/summary`.

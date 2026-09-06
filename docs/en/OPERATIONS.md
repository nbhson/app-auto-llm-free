> **English** | [🇻🇳 Tiếng Việt](../vi/OPERATIONS.md) | [Docs Index](../README.md)

# Operations & Free Tier Verification (24h Sync)

## Problem: freellms.org May Be Outdated

`data/freellms-models-free.json` (316 free) is a snapshot from 2026-09-06. Providers may have already withdrawn their free tier (e.g. Groq 16/23 paid, Ollama Cloud 5/8 paid, OpenRouter 28/45 paid in the scan). A **live** check is needed every 24 hours.

## Solution: 2-Layer Sync

### Layer 1 — Freellms Sync (Initial Source of Truth)

```bash
python scripts/sync-freellms.py
# Fetch https://freellms.org/providers + /models -> data/*.json + models.yaml
# Runs every 24h via GitHub Actions at 02:00 UTC or manually
```

Files:
- `data/freellms-providers.json` — 30 providers, caps/tier
- `data/freellms-models-free.json` — 316 free, includes `score/limit/verified`
- `models.yaml` — 316 entries for the gateway

### Layer 2 — Live Verify (Is It Still Actually Free?)

`apps/gateway/src/jobs/verify-free.ts` compares **freellms FREE** vs **live /models** from the provider.

**Logic:**

```
for each provider in registry (30):
  keys = config.providerKeys[provider] // from .env
  if !keys && provider not in [pollinations, llm7-io]:
     mark all its models -> unverified_no_key
     => API key configuration is needed to verify
  else:
     live = await provider.models(keys[0]) // GET {baseUrl}/models
     for each freellms model in that provider:
        found = live contains id or short name
        status = found ? verified_free : deprecated
```

**Statuses (`status`):**

| Status | Meaning | Action |
|--------|---------|--------|
| `verified_free` | Provider returns the model and it is still free | Use normally |
| `deprecated` | Freellms says free but the live list no longer includes it → may have been withdrawn or renamed | Flag as deprecated; gateway will skip it in fallback if `?verified=free` |
| `unverified_no_key` | No API key configured, so probing is not possible | Warning in `/api/providers` -> `no-key`; add a key to `.env` |
| `error` | Provider unreachable / 429 | Retry later |
| `unverified_no_data` | Verify has never been run | Show freellms data with an unverified badge |

**Output:**

- `data/verified-models.json` — 316 detailed rows (`live_free`, `last_verified`, `error`)
- `data/verified-summary.json` — aggregated summary (`verified_free`, `deprecated`, `unverified_no_key`)

## Automatic Scheduler (24h)

`apps/gateway/src/jobs/scheduler.ts` runs inside the gateway:

- On startup: if `data/verified-models.json` is older than `SYNC_INTERVAL_MS` (default 86400000 = 24h) → verify after 5s
- Then `setInterval` every 24h → `verifyFreeModels()` + `saveVerifyReport()`

Configuration:

```env
SYNC_INTERVAL_MS=86400000
DISABLE_SCHEDULER=0   # set to 1 to disable
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/models?verified=free` | Return only `verified_free` models (316 vs 7 bug fix `lib/paths.ts`) |
| `GET` | `/v1/models?verified=deprecated` | Only deprecated |
| `GET` | `/v1/models?verified=unverified` | Only unverified |
| `GET` | `/v1/models?provider=nvidia-nim` | Filter by provider (the separate provider input was removed; use the first filter `Filter id/provider...`) |
| `GET` | `/api/models/health?model=` | Probe 1 model with chat `Hi` 5 tokens 8s → `usable/unusable/no-key/410 Gone` |
| `GET` | `/api/models/health?provider=&limit=` | Bulk probe `limit` models (summary) |
| `GET` | `/api/verify` | Full report `verified-models.json` |
| `GET` | `/api/verify/summary` | Quick summary |
| `POST` | `/api/verify` | Trigger immediate verify (body `{dryRun: false}`), requires master key |
| `GET` | `/api/providers` | `detailed[]` with `free_models`, `keys`, `Get Key` URL, `status` |
| `GET` | `/api/providers/health` | Live ping of 40 providers in 5s |
| `GET` | `/api/stats` | `allTimeTokens`, `tokensByProvider`, `avgTokens`, `free_models:316`, `breakers` |

Examples:

```bash
curl http://localhost:8080/v1/models?verified=free -H "Authorization: Bearer fgk-xxx" | jq '.total'
curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer fgk-master-xxx" | jq
curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer fgk-master-xxx" -d '{"dryRun":false}' | jq '.total_verified_free'
```

## CLI

```bash
# Dry-run (no key needed, uses freellms as live source)
npm run verify:free:dry -w apps-gateway

# Live (requires .env keys)
npm run verify:free -w apps-gateway
# or
npx tsx apps/gateway/src/jobs/verify-free.ts --dry-run
```

## GitHub Actions (daily 02:00 UTC)

`.github/workflows/sync-freellms.yml` runs:

1. `python scripts/sync-freellms.py` → updates `data/*` + `models.yaml`
2. `tsx verify-free.ts --dry-run` (or live if secrets `GROQ_API_KEYS` etc. are present)
3. Commit if changed → push to `main`

Add secrets in repo Settings → Secrets: `GROQ_API_KEYS`, `CEREBRAS_API_KEYS`, `NVIDIA_API_KEYS`, `GEMINI_API_KEYS`… for live verification instead of dry-run.

## Operational Recommendations

- **Dev**: freellms data alone is sufficient; no verify needed (dry-run takes <1s)
- **Prod**: configure at least 5 P0 keys (NVIDIA, Groq, Cerebras, Gemini, GitHub) to verify 60–70% of models every 24h; remaining providers will stay `unverified_no_key` but still serve with a warning
- **Dashboard**: shows badges `verified_free` (green), `deprecated` (red), `unverified_no_key` (yellow) on the `/models` page — to be implemented in P4

## What Happens When a Model Is Deprecated?

The gateway will:
- Still keep it in `GET /v1/models` but with `live_status: deprecated`
- If `?verified=free`, exclude deprecated from the list (so clients only see tiers that are still actually free)
- The router will skip deprecated entries in `getProvidersForRequest` if verified data exists (P3 will implement `quota-tracker` using the verified map)

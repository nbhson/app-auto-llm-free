> **English** | [🇻🇳 Tiếng Việt](../vi/CONFIGURATION.md) | [Docs Index](../README.md)

# Configuration

## Environment Variables

See the full `.env.example` (30 providers from freellms.org, live sync is now source of truth — freellms disabled). The key groups are below:

### Gateway

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Gateway port |
| `NODE_ENV` | `development` | `development`/`production` |
| `DATABASE_URL` | `file:./data.db` | Drizzle DB — `file:./data.db` (SQLite) or `postgres://user:pass@host/db` |
| `REDIS_URL` | `redis://localhost:6379` | Redis for rate limiting; falls back to in-memory if empty |
| `MASTER_KEY` | (required) | Admin key `fgk-master-...` for creating virtual keys |
| `ENCRYPTION_KEY` | (required) | 32-byte hex for AES-256-GCM (e.g. `openssl rand -hex 32`) |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `CORS_ORIGIN` | `*` | Allow Dashboard origin (2-row header + i18n VI/EN) |
| `SYNC_INTERVAL_MS` | `86400000` | 24h scheduler for verify + live sync |
| `DISABLE_SCHEDULER` | `0` | Set to `1` to disable scheduler |

### Provider Keys (pooled, comma-separated) — 30 freellms providers, live via real keys

```env
# Core
GROQ_API_KEYS=gsk_xxx
CEREBRAS_API_KEYS=csk_xxx
NVIDIA_API_KEYS=nvapi-xxx
GITHUB_TOKENS=ghp_xxx
OPENROUTER_API_KEYS=sk-or-xxx
GEMINI_API_KEYS=AIza_xxx
CLOUDFLARE_API_TOKEN=cf_xxx
CLOUDFLARE_ACCOUNT_ID=acc_xxx

# Cohere / Mistral / SiliconFlow / SambaNova / Chutes / HuggingFace
COHERE_API_KEYS=co_xxx
MISTRAL_API_KEYS=mst_xxx
SILICONFLOW_API_KEYS=sk-xxx
SAMBANOVA_API_KEYS=sn_xxx
CHUTES_API_KEYS=ch_xxx
HUGGINGFACE_API_KEYS=hf_xxx

# Freellms — new (2026-09-06 scan, 316 free models — historical, live now 882 free)
MODELSCOPE_API_KEYS=ms_xxx
OVHCLOUD_API_KEYS=ovh_xxx
KILO_CODE_API_KEYS=kc_xxx
OPENCODE_API_KEYS=oc_xxx
LLM7_API_KEYS=llm7_xxx
AGNES_API_KEYS=ag_xxx
AION_API_KEYS=aion_xxx
Z_AI_API_KEYS=zai_xxx
OLLAMA_CLOUD_API_KEYS=ollama_xxx
GLHF_API_KEYS=glhf_xxx
GROK_API_KEYS=xai_xxx
ALIBABA_API_KEYS=sk-xxx
NSCALE_API_KEYS=nsc_xxx
NEBIUS_API_KEYS=nebius_xxx
AI21_API_KEYS=ai21_xxx
POLLINATIONS_API_KEY= # usually not needed
```

Leaving a provider empty disables it (except `pollinations`/`llm7-io` scraped providers, which are auto-enabled). Real-key check for `hasKey`/`Sync Live Now`: `k.length>20 && !k.includes('xxx') && !k.includes('change-me')`. See the full table in `docs/PROVIDERS.md:1`.

### Router

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_MODEL` | `auto` | Model used when the client sends none |
| `FALLBACK_TIERS` | `[[...]]` | JSON freellms tiers: `[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io","hugging-face"],["openrouter","kilo-code","pollinations"]]` |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before opening the circuit |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | Cooldown duration |

### Rate Limit

`middleware/rate-limit.ts` — list endpoints (`/v1/models`, `/api/providers`, `/api/models/health`) get 4x (`Math.max(rpmLimit*4, 200)`), frontend debounces search `q` by 400ms (Models/Providers) to reduce 429.

## models.yaml — 316 free models (freellms snapshot, historical) + live-models.json (882 free)

Synced historically from freellms.org:

```yaml
models:
  - id: "nvidia-nim/z-ai/glm-5.2"
    display_name: "z-ai/glm-5.2"
    provider: nvidia-nim
    context_length: 1048576
    score: 94
    tier: permanent
    verified: true
    capabilities: [text, reasoning]
    limit: "Up to 40 RPM"
```

Sync job **new** (live source of truth):

```bash
npx tsx apps/gateway/src/jobs/sync-live-models.ts        # fetch live -> data/live-models.json (2185 total, 882 free, freeOnly)
curl -X POST http://localhost:8080/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
# Historical
python scripts/sync-freellms.py        # fetch freellms.org -> data/*.json + models.yaml (disabled)
npm run sync:freellms -w apps-gateway  # alias
```

The gateway `GET /v1/models` reads `data/live-models.json:1` (live 882) when `?hasKey=1` with real keys, otherwise `data/freellms-models-free.json:1` (316 rows), and `GET /api/providers` returns `detailed[]` with `free_models`, `hasRealKey` (green highlight), `limit`, and `verified`, pagination LOV 25/50 at sticky bottom (400ms debounce).

## Rate Limit Config — per-provider (from freellms, live uses same)

| Provider | RPM | RPD | TPM/TPD | Notes |
|----------|-----|-----|---------|-------|
| NVIDIA NIM | 40 shared | — | — | phone required |
| Groq | 30 | 250–14.4K | — | per-model |
| Cerebras | 15 | — | 30K TPM / 1M TPD | — |
| Gemini Flash | 15 | 1.5K | — | — |
| Gemini Lite | 30 | 1.5K | — | — |
| OVH | 2 anon | — | — | — |
| Agnes | 30 | — | — | — |
| OpenRouter | — | 200 free | — | — |
| Kilo Code | ~200/hr | — | — | `:free` suffix |

Stored in `models.yaml:1` `limit` and enforced by `apps/gateway/src/lib/quota-tracker.ts` + `middleware/rate-limit.ts` 4x for list. Token usage `allTimeTokens` + `tokensByProvider` from `lib/request-log.ts:1` powers the Dashboard 4th card and Logs charts (recharts, Live ON SSE + 2s poll).

In the `virtual_keys` table:

```json
{
  "rpmLimit": 60,
  "rpdLimit": 1000,
  "tpmLimit": 100000,
  "tpdLimit": 1000000,
  "scopes": { "models": ["*"], "providers": ["nvidia-nim","groq","google-gemini"] }
}
```

## i18n

`apps/web/src/lib/i18n.tsx` — `VI/EN` dict, `LangProvider`, `localStorage lang` (`vi` default), selector in header row 1 (alongside Master). Docs have `docs/vi/` + `docs/en/` with own banners, root `README.md` default English + `README.vi.md` Vietnamese.

## 2-Row Header

`apps/web/src/main.tsx:40` — `display: flex; flexDirection: column; gap:10`: row 1 `justifyContent: space-between` left logo + health + `30 providers • 316 free` / right `VI/EN` + `Master` input; row 2 nav 5 tabs centered `alignSelf: center`. Previously single row with grid/nav centered — now split into 2 rows.

## Persisted 404 + hide404

`data/model-health.json` + `localStorage hide404`/`hide404_migrated` — 404/410 strikethrough `line-through #dc2626`, disabled checkbox, `hide404` pill default checked hides from UI, `POST /api/models/health/mark` persists.

## Drizzle Config

`drizzle.config.ts`:

```ts
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: process.env.DATABASE_URL.startsWith("postgres") ? "postgresql" : "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Migrate:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio   # GUI
```

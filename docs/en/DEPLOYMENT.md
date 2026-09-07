> **English** | [🇻🇳 Tiếng Việt](../vi/DEPLOYMENT.md) | [Docs Index](../README.md)

# Deployment

> Nav order **Providers before Models** (sticky), Dashboard with 4 cards + 3 charts + tokens, `lib/paths.ts` fixes 7→316 when `cwd=apps/gateway`, **2-row header** (row1 `30 providers • 316 free` + Master + VI/EN same row, row2 centered nav), **live sync is source of truth** (freellms disabled).

## 1. Docker Compose (recommended)

Production-ready, includes gateway + postgres + redis, plus a 24h verify + live sync scheduler and `GET /api/models/health` per-model probe + rate-limit 4x for list endpoints.

```yaml
# docker-compose.yml
services:
  gateway:
    build: ./apps/gateway
    ports: ["8080:8080"]
    env_file: .env
    environment:
      DATABASE_URL: postgres://gateway:gateway@postgres:5432/gateway
      REDIS_URL: redis://redis:6379
      SYNC_INTERVAL_MS: 86400000
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
  web:
    build: ./apps/web
    ports: ["3000:80"]
    environment:
      VITE_GATEWAY_URL: http://gateway:8080
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: gateway, POSTGRES_PASSWORD: gateway }
  redis:
    image: redis:7-alpine
volumes: { pgdata: {} }
```

```bash
cp .env.example .env
# no need to fill MASTER_KEY/ENCRYPTION_KEY — auto-generated on first boot and persisted to .env or data/.gateway-keys.json (volume gateway-data)
# only fill provider keys (30 freellms providers, real keys for hasKey) if you have them
# SYNC_INTERVAL_MS=86400000 (24h) or DISABLE_SCHEDULER=1
docker compose up -d --build
docker compose logs -f gateway  # check Auto-generated MASTER_KEY=fgk-master-...
grep MASTER_KEY .env  # single key for /v1/* + /api/*
```

Health check: `curl http://localhost:8080/v1/health` → `providers:43`, `tiers` 4-tier freellms  
Verify check: `curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer $MASTER_KEY"`  
Live sync: `curl http://localhost:8080/api/models/live -H "Authorization: Bearer $MASTER_KEY"` (2185 total) + `curl -X POST http://localhost:8080/api/models/live/sync -H "Authorization: Bearer $MASTER_KEY" -d '{"freeOnly":true}'`  
Live models: `curl "http://localhost:8080/v1/models?hasKey=1" -H "Authorization: Bearer $MASTER_KEY"` → 2190 total  
Sync trigger (historical freellms, disabled): `curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer $MASTER_KEY" -d '{"dryRun":false}'`

## 2. Bare Metal / VPS

```bash
npm install
npm run build
# Postgres + Redis must already be running
DATABASE_URL=postgres://... REDIS_URL=redis://... SYNC_INTERVAL_MS=86400000 npm run start:gateway -w apps-gateway
# Dashboard static build (2-row header + i18n VI/EN)
npm run build -w apps-web && npm run preview -w apps-web
pm2 start ecosystem.config.cjs
```

Manual live sync:

```bash
npx tsx apps/gateway/src/jobs/sync-live-models.ts          # live fetch -> data/live-models.json (882 free, freeOnly)
curl -X POST http://localhost:8080/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
# Freellms (historical, disabled)
python scripts/sync-freellms.py          # 30 providers, 316 free -> data/*.json + models.yaml
npm run verify:free:dry -w apps-gateway  # dry-run, no keys needed
npm run verify:free -w apps-gateway      # live, requires .env keys (NVIDIA, Groq...)
```

Nginx reverse proxy:

```nginx
server {
  listen 80;
  server_name api.yourdomain.com;
  location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
  location /v1/chat/completions {
    proxy_pass http://127.0.0.1:8080;
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
  location /api/verify { proxy_pass http://127.0.0.1:8080; }
  location /api/models/live { proxy_pass http://127.0.0.1:8080; }
}
```

## 3. Cloudflare Workers

Hono supports multi-runtime (WinterCG). Replace Redis with KV and use Cron Triggers for the scheduler.

```bash
# apps/gateway/wrangler.jsonc
{
  "name": "free-llm-gateway",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-06",
  "kv_namespaces": [{ "binding": "RATE_LIMIT_KV", "id": "..." }],
  "vars": { "DATABASE_URL": "libsql://...", "SYNC_INTERVAL_MS": "86400000" }
}
npm run deploy:cf -w apps-gateway
```

Note: Workers does not include `better-sqlite3`; use `@libsql/client` (Turso) instead. On Workers, the scheduler uses the `scheduled` event instead of `setInterval` (both verify + syncLiveModels).

## 4. Vercel

The Dashboard (`apps/web`) can be deployed directly to Vercel (Vite, 2-row header, i18n VI/EN persists `localStorage lang`). The gateway can be deployed as a Vercel Function, but keeping it on a VPS/Workers is recommended for stable SSE and continuous 24h scheduling.

## 5. Production Environment Variables

* `NODE_ENV=production`, `LOG_LEVEL=warn`
* `ENCRYPTION_KEY`/`MASTER_KEY` are auto-generated for dev; **prod** should override via secret manager (never commit): `ENCRYPTION_KEY=$(openssl rand -hex 32)`, `MASTER_KEY=fgk-master-$(openssl rand -hex 16)`
* `CORS_ORIGIN=https://yourdomain.com` (do not leave as `*`)
* `SYNC_INTERVAL_MS=86400000` (24h), `DISABLE_SCHEDULER=0` — scheduler calls both `verifyFreeModels` + `syncLiveModels` every 24h
* Provider keys: at least 5 P0 providers (NVIDIA, Groq, Cerebras, Gemini, GitHub) for live sync 882 free / 853 hasKey; remaining providers will be `unverified_no_key` but still serve traffic; real-key check `!xxx`, length>20 for `hasKey`
* Freellms sync: GitHub Actions cron at 02:00 UTC already configured in `.github/workflows/sync-freellms.yml:1` (historical, disabled; live sync replaces it)
* Rate limit: `middleware/rate-limit.ts` already increased 4x (min 200) for `/v1/models`, `/api/providers`, `/api/models/health` + frontend debounce 400ms

## 6. Monitoring & Verify

* `/v1/health` for uptime checks (UptimeRobot)
* `/api/stats` for Grafana (poll every 10s) — `free_models:316`, `providers:43`, live `data/live-models.json:1` 2185/882
* `/api/verify/summary` to alert if `deprecated` spikes (freellms data is stale) + `/api/models/live` to check live cache freshness
* `/api/verify` for per-model `live_status` details + `/api/models/health/persisted` 404 strikethrough
* GitHub Actions daily: `sync-freellms.yml` auto-commits `data/` + `models.yaml` when changes are detected (now live sync replaces it)
* Logs: `docker compose logs` or `pino-pretty` locally, `OTEL_EXPORTER_OTLP_ENDPOINT` → Langfuse/Axiom; Logs page only **Live ON (SSE + 2s poll)**, duplicate `Auto sync 5s` removed
* Docs: `docs/vi/` + `docs/en/` with own banners; root `README.md` default English (previously Vietnamese), `README.vi.md` Vietnamese; UI language selected in header and persisted via `localStorage lang` (`lib/i18n.tsx`)

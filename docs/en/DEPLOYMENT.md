> **English** | [🇻🇳 Tiếng Việt](../vi/DEPLOYMENT.md) | [Docs Index](../README.md)

# Deployment

> Nav order **Providers before Models** (sticky), Dashboard with 4 cards + 3 charts + tokens, `lib/paths.ts` fixes 7→316 when `cwd=apps/gateway`.

## 1. Docker Compose (recommended)

Production-ready, includes gateway + postgres + redis, plus a 24h verify scheduler and `GET /api/models/health` per-model probe.

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
# fill in MASTER_KEY, ENCRYPTION_KEY, provider keys (30 freellms providers)
# SYNC_INTERVAL_MS=86400000 (24h) or DISABLE_SCHEDULER=1
docker compose up -d --build
docker compose logs -f gateway
```

Health check: `curl http://localhost:8080/v1/health` → `providers:43`, `tiers` 4-tier freellms  
Verify check: `curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer $MASTER_KEY"`  
Sync trigger: `curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer $MASTER_KEY" -d '{"dryRun":false}'`

## 2. Bare Metal / VPS

```bash
npm install
npm run build
# Postgres + Redis must already be running
DATABASE_URL=postgres://... REDIS_URL=redis://... SYNC_INTERVAL_MS=86400000 npm run start:gateway -w apps-gateway
# Dashboard static build
npm run build -w apps-web && npm run preview -w apps-web
pm2 start ecosystem.config.cjs
```

Manual freellms sync:

```bash
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

Note: Workers does not include `better-sqlite3`; use `@libsql/client` (Turso) instead. On Workers, the scheduler uses the `scheduled` event instead of `setInterval`.

## 4. Vercel

The Dashboard (`apps/web`) can be deployed directly to Vercel (Vite). The gateway can be deployed as a Vercel Function, but keeping it on a VPS/Workers is recommended for stable SSE and continuous 24h scheduling.

## 5. Production Environment Variables

* `NODE_ENV=production`, `LOG_LEVEL=warn`
* Generate `ENCRYPTION_KEY` with `openssl rand -hex 32` and store it in a secret manager (never commit it)
* `MASTER_KEY` format `fgk-master-$(openssl rand -hex 16)`
* `CORS_ORIGIN=https://yourdomain.com` (do not leave as `*`)
* `SYNC_INTERVAL_MS=86400000` (24h), `DISABLE_SCHEDULER=0`
* Provider keys: at least 5 P0 providers (NVIDIA, Groq, Cerebras, Gemini, GitHub) to verify 60–70% of models; remaining providers will be `unverified_no_key` but still serve traffic
* Freellms sync: GitHub Actions cron at 02:00 UTC already configured in `.github/workflows/sync-freellms.yml:1`

## 6. Monitoring & Verify

* `/v1/health` for uptime checks (UptimeRobot)
* `/api/stats` for Grafana (poll every 10s) — `free_models:316`, `providers:43`
* `/api/verify/summary` to alert if `deprecated` spikes (freellms data is stale)
* `/api/verify` for per-model `live_status` details
* GitHub Actions daily: `sync-freellms.yml` auto-commits `data/` + `models.yaml` when changes are detected
* Logs: `docker compose logs` or `pino-pretty` locally, `OTEL_EXPORTER_OTLP_ENDPOINT` → Langfuse/Axiom

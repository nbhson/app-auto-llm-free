> **English** | [🇻🇳 Tiếng Việt](../vi/DEPLOYMENT.md) | [Docs Index](../README.md)

# Triển khai (Deployment)

> Nav **Providers trước Models** (sticky), Dashboard 4 cards + 3 charts + tokens, `lib/paths.ts` fix 7→316 cho `cwd=apps/gateway`.

## 1. Docker Compose (khuyến nghị)

Production-ready, gồm gateway + postgres + redis, kèm 24h verify scheduler + `GET /api/models/health` per-model probe.

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
# điền MASTER_KEY, ENCRYPTION_KEY, provider keys (30 providers freellms)
# SYNC_INTERVAL_MS=86400000 (24h) hoặc DISABLE_SCHEDULER=1
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
# Postgres + Redis phải chạy sẵn
DATABASE_URL=postgres://... REDIS_URL=redis://... SYNC_INTERVAL_MS=86400000 npm run start:gateway -w apps-gateway
# Dashboard build static
npm run build -w apps-web && npm run preview -w apps-web
pm2 start ecosystem.config.cjs
```

Freellms sync thủ công:

```bash
python scripts/sync-freellms.py          # 30 providers, 316 free -> data/*.json + models.yaml
npm run verify:free:dry -w apps-gateway  # dry-run không cần keys
npm run verify:free -w apps-gateway      # live cần .env keys (NVIDIA, Groq...)
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

Hono hỗ trợ multi-runtime (WinterCG). Cần thay Redis → KV, scheduler dùng Cron Triggers.

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

Lưu ý: Workers không có `better-sqlite3`, dùng `@libsql/client` (Turso) thay thế. Scheduler trên Workers dùng `scheduled` event thay vì `setInterval`.

## 4. Vercel

Dashboard (`apps/web`) deploy trực tiếp Vercel (Vite). Gateway có thể deploy như Vercel Function nhưng khuyến nghị giữ trên VPS/Workers để SSE ổn định và scheduler 24h chạy liên tục.

## 5. Biến môi trường production

* `NODE_ENV=production`, `LOG_LEVEL=warn`
* `ENCRYPTION_KEY` sinh bằng `openssl rand -hex 32` và lưu secret manager (không commit)
* `MASTER_KEY` dạng `fgk-master-$(openssl rand -hex 16)`
* `CORS_ORIGIN=https://yourdomain.com` (không để `*`)
* `SYNC_INTERVAL_MS=86400000` (24h), `DISABLE_SCHEDULER=0`
* Provider keys: ít nhất 5 P0 (NVIDIA, Groq, Cerebras, Gemini, GitHub) để verify 60-70% models; các provider còn lại sẽ `unverified_no_key` nhưng vẫn phục vụ
* Freellms sync: cron GitHub Actions 02:00 UTC đã cấu hình `.github/workflows/sync-freellms.yml:1`

## 6. Monitoring & Verify

* `/v1/health` cho uptime check (UptimeRobot)
* `/api/stats` cho Grafana (poll 10s) — `free_models:316`, `providers:43`
* `/api/verify/summary` cho alert nếu `deprecated` tăng đột biến (freellms stale)
* `/api/verify` chi tiết per-model `live_status`
* GitHub Actions daily: `sync-freellms.yml` tự động commit `data/` + `models.yaml` nếu có thay đổi
* Logs: `docker compose logs` hoặc `pino-pretty` local, `OTEL_EXPORTER_OTLP_ENDPOINT` → Langfuse/Axiom

# Triển khai (Deployment)

## 1. Docker Compose (khuyến nghị)

Production-ready, gồm gateway + postgres + redis.

```yaml
# docker-compose.yml
services:
  gateway:
    build: ./apps/gateway
    ports: ["8080:8080"]
    env_file: .env
    depends_on: [postgres, redis]
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    environment:
      VITE_GATEWAY_URL: http://gateway:8080
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: gateway, POSTGRES_PASSWORD: secret }
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
volumes: { pgdata: {} }
```

```bash
cp .env.example .env
# điền MASTER_KEY, ENCRYPTION_KEY, provider keys
docker compose up -d --build
docker compose logs -f gateway
```

Health check: `curl http://localhost:8080/v1/health`

## 2. Bare Metal / VPS

```bash
bun install
bun run build
# Postgres + Redis phải chạy sẵn
DATABASE_URL=postgres://... REDIS_URL=redis://... bun run start:gateway
# Dashboard build static
bun run build:web && bun run preview:web
# Hoặc dùng pm2
pm2 start ecosystem.config.cjs
```

Nginx reverse proxy:

```nginx
server {
  listen 80;
  server_name api.yourdomain.com;
  location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
  # SSE cần tắt buffering
  location /v1/chat/completions {
    proxy_pass http://127.0.0.1:8080;
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
}
```

## 3. Cloudflare Workers

Hono hỗ trợ multi-runtime (WinterCG). Cần thay Redis → KV.

```bash
# apps/gateway/wrangler.jsonc
{
  "name": "free-llm-gateway",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-06",
  "kv_namespaces": [{ "binding": "RATE_LIMIT_KV", "id": "..." }],
  "vars": { "DATABASE_URL": "libsql://..." }
}
bun run deploy:cf
```

Lưu ý: Workers không có `better-sqlite3`, dùng `@libsql/client` (Turso) thay thế.

## 4. Vercel

Dashboard (`apps/web`) deploy trực tiếp Vercel (Vite). Gateway có thể deploy như Vercel Function nếu dùng `@hono/node-server` vercel preset, nhưng khuyến nghị gateway giữ trên VPS/Workers để SSE ổn định.

## 5. Biến môi trường production

* Đặt `NODE_ENV=production`, `LOG_LEVEL=warn`
* `ENCRYPTION_KEY` sinh bằng `openssl rand -hex 32` và lưu trong secret manager (không commit)
* `MASTER_KEY` dạng `fgk-master-$(openssl rand -hex 16)`
* Enable `CORS_ORIGIN=https://yourdomain.com` (không để `*`)

## 6. Monitoring

* `/v1/health` cho uptime check (UptimeRobot, BetterStack)
* `/api/stats` cho Grafana (poll 10s)
* OTel → Langfuse / Axiom nếu cấu hình `OTEL_EXPORTER_OTLP_ENDPOINT`
* Logs: `docker compose logs` hoặc `pino-pretty` local

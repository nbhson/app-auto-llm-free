# Production Guide

> **English** | [Docs Index](../README.md)

Hướng dẫn vận hành production: migration SQLite → Postgres, monitoring, alerting, backup và hardening.

## 1. Checklist trước khi deploy

| Item | Yêu cầu |
|------|---------|
| Node >= 22 hoặc Docker | `node -v` / `docker version` |
| Postgres 16+ | SQLite chỉ dành cho dev |
| Redis 7+ | Bắt buộc cho quota/breaker/semantic cache |
| `MASTER_KEY` / `ENCRYPTION_KEY` | Set thủ công (không dùng auto-generate trong prod) |
| `EXPOSE_BOOTSTRAP=0` | Mặc định — KHÔNG BAO GIỜ bật trên public server |
| TLS | Reverse proxy (nginx/Caddy/Cloudflare) termination |

## 2. Migration SQLite → Postgres

```bash
# 1. Backup SQLite hiện tại
cp data/gateway.db data/gateway.db.bak

# 2. Set DATABASE_URL trong .env
echo 'DATABASE_URL=postgres://user:pass@host:5432/gateway' >> .env

# 3. Generate + run migrations
npm run db:generate
npm run db:migrate

# 4. (Optional) Export/import data nếu cần — request-log, keys là file-based,
# chỉ provider stats trong data/ cần copy
docker cp container:/app/data ./data
```

> Virtual keys + request log lưu trong `data/` (file-based) — không mất khi đổi DB.

## 3. Docker Compose production

```bash
# .env production
MASTER_KEY=fgk-master-<random-32-hex>       # openssl rand -hex 16
ENCRYPTION_KEY=<random-64-hex>              # openssl rand -hex 32
EXPOSE_BOOTSTRAP=0
NODE_ENV=production
DATABASE_URL=postgres://gateway:gateway@postgres:5432/gateway
REDIS_URL=redis://redis:6379
LOG_LEVEL=info
SYNC_INTERVAL_MS=86400000
DISABLE_SCHEDULER=0
```

```bash
docker compose up -d --build
docker compose logs -f gateway | head -50   # verify boot OK
curl http://localhost:7373/health           # {"status":"ok"}
```

## 4. Health checks & Load balancing

Gateway expose 3 probe endpoints (không cần auth):

| Endpoint | Mục đích | Dùng cho |
|----------|----------|----------|
| `GET /health` | Liveness — process sống | Docker/K8s livenessProbe, LB |
| `GET /health/ready` | Readiness — có thể nhận request | LB, K8s readinessProbe |
| `GET /v1/health` | Chi tiết — version, providers, tiers | Dashboard, monitoring |

Docker Compose đã có healthcheck (xem `docker-compose.yml`). Cho K8s:

```yaml
livenessProbe:
  httpGet: { path: /health, port: 7373 }
  initialDelaySeconds: 10
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /health/ready, port: 7373 }
  initialDelaySeconds: 5
  periodSeconds: 5
```

## 5. Monitoring

### 5.1 Metrics endpoints (đã có sẵn)

| Endpoint | Dữ liệu |
|----------|---------|
| `GET /api/stats` | providers, models, logs total, breakers, flags |
| `GET /api/analytics?interval=hour` | totalRequests, p95, costByProvider, cacheHitRate |
| `GET /api/logs?limit=100` | Request log gần nhất |
| `GET /api/cache/stats` | Semantic cache hits/misses |

### 5.2 Promtail/Loki hoặc ELK

Gateway log bằng Pino (JSON stdout). Đã redact `Authorization` / `x-api-key`:

```bash
# Collect stdout JSON
docker logs gateway 2>&1 | jq 'select(.level>=40)'
```

### 5.3 Uptime check (uptime-kuma / Better Stack)

```
https://your-domain/health        # expect 200 {"status":"ok"}
https://your-domain/health/ready  # expect 200 {"ready":true}
```

Alert nếu 3 lần liên tiếp fail.

### 5.4 Alert thresholds đề xuất

| Metric | Warning | Critical |
|--------|---------|----------|
| `p95 latency` (analytics) | > 3s | > 8s |
| `errorsByProvider` tăng đột ngột | 1 provider > 10 lỗi/giờ | 3+ providers fail |
| `cacheHitRate` giảm | < 5% | — |
| Breaker open (breakers trong /api/stats) | 1 open | 3+ open |

## 6. Reverse proxy + TLS (Caddy)

```Caddyfile
gateway.example.com {
    reverse_proxy localhost:7373
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Frame-Options DENY
    }
}
```

## 7. Backup

```bash
# Cron daily 03:00 — Postgres dump + data files
0 3 * * * docker compose exec postgres pg_dump -U gateway gateway | gzip > backup/db-$(date +\%F).sql.gz
0 3 * * * tar czf backup/data-$(date +\%F).tar.gz data/
# Giữ 30 ngày
0 4 * * * find backup/ -mtime +30 -delete
```

Phục hồi:
```bash
gunzip -c backup/db-2026-09-11.sql.gz | docker compose exec -T postgres psql -U gateway gateway
tar xzf backup/data-2026-09-11.tar.gz
docker compose restart gateway
```

## 8. Security hardening

| Setting | Giá trị prod |
|---------|---------------|
| `EXPOSE_BOOTSTRAP` | `0` (mặc định) |
| Virtual keys cho client apps | KHÔNG dùng MASTER_KEY cho app client |
| `LOG_LEVEL` | `info` (không `debug` — tránh log body) |
| Rate limit per key | Set `rpmLimit` khi tạo key qua `/api/keys` |
| CORS | Set `CORS_ORIGIN` domain cụ thể, không `*` |
| Rotation key định kỳ | `scripts/rotate-keys.ts` (nếu có) hoặc tạo key mới + migrate client + revoke cũ |

## 9. Scaling

- **Gateway stateless** — scale ngang bằng nhiều instance sau một LB (rate-limit + breaker + cache dùng chung Redis nên nhất quán).
- **Scheduler**: khi chạy nhiều instance, set `DISABLE_SCHEDULER=1` cho tất cả trừ 1 instance (tránh sync trùng lặp).
- **Postgres**: connection pool mặc định của pg — đảm bảo `max_connections` đủ cho số instance.

```bash
# 3 instances sau nginx upstream
upstream gateway {
    server 10.0.0.1:7373;
    server 10.0.0.2:7373;
    server 10.0.0.3:7373;
}
```

## 10. Troubleshooting nhanh

| Triệu chứng | Kiểm tra |
|-------------|----------|
| `502 provider_error` trên mọi request | `GET /api/stats` → breakers open? Key hết quota? |
| Gateway không start | `docker compose logs gateway` — lỗi .env hay port 7373 bị chiếm? |
| `.env` đổi không nhận | Restart toàn bộ: `docker compose restart gateway` (gateway chỉ đọc .env lúc boot) |
| Cache hit thấp | `GET /api/cache/stats` — semantic cache chỉ hoạt động `!stream` |
| 401 sau khi đổi MASTER_KEY | Client đang dùng key cũ — update hoặc tạo virtual key mới |

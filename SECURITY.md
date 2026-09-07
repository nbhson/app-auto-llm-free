# Security Policy

## Hỗ trợ phiên bản

| Version | Supported |
|---------|-----------|
| main    | ✅        |

## Báo cáo lỗ hổng

Vui lòng **không** mở public issue cho lỗ hổng bảo mật. Gửi email tới maintainer hoặc mở private security advisory trên GitHub.

Chúng tôi sẽ phản hồi trong 48h và fix trong 7 ngày nếu confirmed.

## Thực hành bảo mật trong gateway (P5 Hardening)

* **Encryption at rest**: Provider keys mã hóa AES-256-GCM (`AES-256-GCM iv:tag:ciphertext`, key 32 bytes hex) qua `lib/key-manager.ts:1` `encrypt/decrypt` — key `ENCRYPTION_KEY` **tự sinh** 64 hex nếu thiếu (`config.ts:32`), không dùng làm API key. Không lưu plaintext. Virtual keys lưu hash SHA-256 + timing-safe compare.
* **Virtual keys**: `fgk-...` hash SHA-256, `hasScope` check model/provider, `rpmLimit` per-key, `role admin/user`. Admin required cho `POST/DELETE /api/keys`. `fgk-...` là tùy chọn per-app, không bắt buộc.
* **Master key (single-key)**: `MASTER_KEY=fgk-master-...` **1 key duy nhất** cho `/v1/*` + `/api/*` admin, **tự sinh** nếu thiếu/placeholder (`config.ts:32`) và persist `.env` hoặc `data/.gateway-keys.json`. Seed virtual key `vk-master` admin. Nên rotate định kỳ (3 tháng).
* **Rate limit**: 2-layer — virtualKey RPM (60s per-key, `middleware/rate-limit.ts:1` → `x-ratelimit-*`, 429) + provider RPM/TPM (`lib/quota-tracker.ts:1` FREELLMS_LIMITS: NVIDIA 40, Groq 30, Cerebras 15/1M, Gemini 15/1.5K, OVH 2, etc) + `markRateLimited` Retry-After.
* **Circuit breaker**: 5 fails → open 30s, half-open trial (`lib/circuit-breaker.ts:1`), `GET /api/providers/health` trả `breaker` state.
* **Headers**: `secureHeaders()` (Hono), `CORS` (`origin: CORS_ORIGIN`, `maxAge 86400`), `bodyLimit` 10MB (`hono/body-limit`).
* **TLS**: `NODE_TLS_REJECT_UNAUTHORIZED=0` tắt verify toàn cục (Node) — chỉ dùng dev sau corporate proxy SSL inspection (Zscaler) khi gặp `SELF_SIGNED_CERT_IN_CHAIN`. Prod luôn giữ verify; thay thế an toàn `NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.crt`. Không commit `0` vào prod.
* **Logs**: không log `Authorization` header, chỉ log `virtualKeyId`/`provider`/`latency`, `pino` pretty dev / JSON prod, OTel GenAI (`lib/otel.ts:1` nếu `OTEL_EXPORTER_OTLP_ENDPOINT` set).
* **Scheduler**: verify 24h không leak key (chỉ dùng hash prefix).

## Rotation

### ENCRYPTION_KEY (AES-256-GCM)

```bash
# Tạo key mới
openssl rand -hex 32  # => 64 hex, ví dụ a1b2...
NEW_KEY=$(openssl rand -hex 32)
OLD_KEY=$(grep ENCRYPTION_KEY .env | cut -d= -f2)

# Update .env
sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$NEW_KEY/" .env  # macOS; Linux dùng sed -i

# Re-encrypt stored provider keys (nếu có DB/file)
OLD_KEY=$OLD_KEY NEW_KEY=$NEW_KEY npx tsx scripts/rotate-keys.ts --file data/provider-keys.json

# Hoặc
npx tsx scripts/rotate-keys.ts --old $OLD_KEY --new $NEW_KEY --file data/virtual-keys.json
```

Script `scripts/rotate-keys.ts:1` đọc `iv:tag:ciphertext`, decrypt với OLD, encrypt lại với NEW, ghi lại file. Virtual keys là hash (không cần rotate), chỉ provider_keys encrypted cần.

### MASTER_KEY

```bash
openssl rand -hex 16  # suffix
NEW_MASTER="fgk-master-$(openssl rand -hex 16)"
# Update .env và tạo lại virtual key admin
MASTER_KEY=$NEW_MASTER npx tsx -e "import('./apps/gateway/dist/lib/virtual-keys.js').then(m=>console.log(m.createVirtualKey({name:'master',role:'admin'})))"
```

### Kiểm tra sau rotate

```bash
curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer $NEW_MASTER" | jq
curl http://localhost:8080/api/keys -H "Authorization: Bearer $NEW_MASTER" | jq
npm run verify:free:dry -w apps-gateway
```

## Hardening Checklist (Production)

- [ ] `NODE_ENV=production`, `LOG_LEVEL=warn`, `CORS_ORIGIN=https://yourdomain.com`
- [ ] Không đặt `NODE_TLS_REJECT_UNAUTHORIZED=0` (giữ verify TLS); nếu sau proxy thì dùng `NODE_EXTRA_CA_CERTS`
- [ ] `ENCRYPTION_KEY`/`MASTER_KEY` đã tự sinh cho dev; prod override qua secret manager (`openssl rand -hex 32` / `fgk-master-$(openssl rand -hex 16)`), rotate 3 tháng
- [ ] `REDIS_URL` cho quota-tracker + rate-limit (không fallback in-memory)
- [ ] `DATABASE_URL` Postgres (không SQLite file)
- [ ] Health check: `GET /v1/health` + `GET /api/providers/health` (UptimeRobot)
- [ ] Benchmark: `npx tsx scripts/benchmark.ts --gateway https://api.yourdomain.com --key $MASTER_KEY`

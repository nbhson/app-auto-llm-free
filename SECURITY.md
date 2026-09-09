# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | ✅        |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities. Email the maintainer or open a private security advisory on GitHub.

We will respond within 48 hours and fix within 7 days if confirmed.

## Security Practices in Gateway (P5 Hardening)

* **Encryption at rest**: Provider keys encrypted with AES-256-GCM (`AES-256-GCM iv:tag:ciphertext`, 32-byte hex key) via `lib/key-manager.ts:1` `encrypt/decrypt` — key `ENCRYPTION_KEY` **auto-generated** as 64 hex if missing (`config.ts:32`), never used as API key. No plaintext storage. Virtual keys stored as SHA-256 hash + timing-safe compare.
* **Virtual keys**: `fgk-...` SHA-256 hash, `hasScope` checks model/provider, `rpmLimit` per-key, `role admin/user`. Admin required for `POST/DELETE /api/keys`. `fgk-...` is optional per-app, not required.
* **Master key (single-key)**: `MASTER_KEY=fgk-master-...` **single key** for `/v1/*` + `/api/*` admin, **auto-generated** if missing/placeholder (`config.ts:32`) and persisted to `.env` or `data/.gateway-keys.json`. Seed virtual key `vk-master` admin. Should rotate periodically (3 months).
* **Rate limit**: 2-layer — virtualKey RPM (60s per-key, `middleware/rate-limit.ts:1` → `x-ratelimit-*`, 429) + provider RPM/TPM (`lib/quota-tracker.ts:1` FREELLMS_LIMITS: NVIDIA 40, Groq 30, Cerebras 15/1M, Gemini 15/1.5K, OVH 2, etc) + `markRateLimited` Retry-After.
* **Circuit breaker**: 5 failures → open 30s, half-open trial (`lib/circuit-breaker.ts:1`), `GET /api/providers/health` returns `breaker` state.
* **Headers**: `secureHeaders()` (Hono), `CORS` (`origin: CORS_ORIGIN`, `maxAge 86400`), `bodyLimit` 10MB (`hono/body-limit`).
* **TLS**: `NODE_TLS_REJECT_UNAUTHORIZED=0` disables global TLS verification (Node) — only for dev behind corporate proxy SSL inspection (Zscaler) when seeing `SELF_SIGNED_CERT_IN_CHAIN`. Prod must keep verification; safer alternative `NODE_EXTRA_CA_CERTS=/path/to/corporate-ca.crt`. Never commit `0` to prod.
* **Logs**: no `Authorization` header logging, only `virtualKeyId`/`provider`/`latency`, `pino` pretty dev / JSON prod, OTel GenAI (`lib/otel.ts:1` if `OTEL_EXPORTER_OTLP_ENDPOINT` set).
* **Scheduler**: 24h verify does not leak keys (only uses hash prefix).

## Rotation

### ENCRYPTION_KEY (AES-256-GCM)

```bash
# Generate new key
openssl rand -hex 32  # => 64 hex, e.g. a1b2...
NEW_KEY=$(openssl rand -hex 32)
OLD_KEY=$(grep ENCRYPTION_KEY .env | cut -d= -f2)

# Update .env
sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$NEW_KEY/" .env  # macOS; Linux use sed -i

# Re-encrypt stored provider keys (if DB/file exists)
OLD_KEY=$OLD_KEY NEW_KEY=$NEW_KEY npx tsx scripts/rotate-keys.ts --file data/provider-keys.json

# Or
npx tsx scripts/rotate-keys.ts --old $OLD_KEY --new $NEW_KEY --file data/virtual-keys.json
```

Script `scripts/rotate-keys.ts:1` reads `iv:tag:ciphertext`, decrypts with OLD, re-encrypts with NEW, writes back. Virtual keys are hashes (no rotation needed), only encrypted provider_keys need rotation.

### MASTER_KEY

```bash
openssl rand -hex 16  # suffix
NEW_MASTER="fgk-master-$(openssl rand -hex 16)"
# Update .env and recreate admin virtual key
MASTER_KEY=$NEW_MASTER npx tsx -e "import('./apps/gateway/dist/lib/virtual-keys.js').then(m=>console.log(m.createVirtualKey({name:'master',role:'admin'})))"
```

### Post-Rotation Verification

```bash
curl http://localhost:7373/api/verify/summary -H "Authorization: Bearer $NEW_MASTER" | jq
curl http://localhost:7373/api/keys -H "Authorization: Bearer $NEW_MASTER" | jq
npm run verify:free:dry -w apps-gateway
```

## Hardening Checklist (Production)

- [ ] `NODE_ENV=production`, `LOG_LEVEL=warn`, `CORS_ORIGIN=https://yourdomain.com`
- [ ] Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` (keep TLS verify); if behind proxy use `NODE_EXTRA_CA_CERTS`
- [ ] `ENCRYPTION_KEY`/`MASTER_KEY` auto-generated for dev; prod override via secret manager (`openssl rand -hex 32` / `fgk-master-$(openssl rand -hex 16)`), rotate quarterly
- [ ] `REDIS_URL` for quota-tracker + rate-limit (no in-memory fallback)
- [ ] `DATABASE_URL` Postgres (no SQLite file)
- [ ] Health check: `GET /v1/health` + `GET /api/providers/health` (UptimeRobot)
- [ ] Benchmark: `npx tsx scripts/benchmark.ts --gateway https://api.yourdomain.com --key $MASTER_KEY`
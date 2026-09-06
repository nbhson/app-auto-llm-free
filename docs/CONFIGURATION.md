# Cấu hình (Configuration)

## Biến môi trường

Xem `.env.example` đầy đủ. Dưới đây là nhóm quan trọng:

### Gateway

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `8080` | Port gateway |
| `NODE_ENV` | `development` | `development`/`production` |
| `DATABASE_URL` | `file:./data.db` | Drizzle DB — `file:./data.db` (SQLite) hoặc `postgres://user:pass@host/db` |
| `REDIS_URL` | `redis://localhost:6379` | Redis cho rate limit; nếu trống fallback in-memory |
| `MASTER_KEY` | (required) | Key admin `fgk-master-...` để tạo virtual keys |
| `ENCRYPTION_KEY` | (required) | 32 bytes hex cho AES-256-GCM (vd: `openssl rand -hex 32`) |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `CORS_ORIGIN` | `*` | Cho phép Dashboard |

### Provider Keys (pool, phân tách dấu phẩy)

```env
GROQ_API_KEYS=gsk_xxx,gsk_yyy
GEMINI_API_KEYS=AIza_xxx,AIza_yyy
CEREBRAS_API_KEYS=csk_xxx
TOGETHER_API_KEYS=tvy_xxx
MISTRAL_API_KEYS=mst_xxx
COHERE_API_KEYS=co_xxx
HUGGINGFACE_API_KEYS=hf_xxx
GITHUB_TOKENS=ghp_xxx
CLOUDFLARE_API_TOKEN=cf_xxx
CLOUDFLARE_ACCOUNT_ID=acc_xxx
NVIDIA_API_KEYS=nvapi-xxx
SILICONFLOW_API_KEYS=sk-xxx
SAMBA_NOVA_API_KEYS=sn_xxx
POLLINATIONS_API_KEY= # thường không cần
```

Để trống provider nào thì provider đó bị disable (trừ scraped tự động enable).

### Router

| Biến | Mô tả |
|------|-------|
| `DEFAULT_MODEL` | `auto` — model khi client không truyền |
| `FALLBACK_TIERS` | JSON tiers: `[["groq","cerebras"],["gemini","together"],["pollinations"]]` |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` fails để open |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` |

## models.yaml

Catalog 260+ models, sync tự động:

```yaml
models:
  - id: groq/llama-3.3-70b-versatile
    display_name: Llama 3.3 70B (Groq)
    provider: groq
    context_length: 131072
    max_output: 8192
    capabilities: [chat, tools]
    free_tier: { rpm: 30, rpd: 14400, tpm: 6000 }
    aliases: [llama-3.3-70b, llama, gpt-4]
  - id: pollinations/openai
    provider: pollinations
    context_length: 8192
    free_tier: { rpm: 60 }
```

Sync job:

```bash
bun run sync:providers   # fetch từ provider APIs + LiteLLM pricing
bun run sync:models      # update models.yaml
```

## Rate Limit config

Trong `virtual_keys` table:

```json
{
  "rpmLimit": 60,
  "rpdLimit": 1000,
  "tpmLimit": 100000,
  "tpdLimit": 1000000,
  "scopes": { "models": ["*"], "providers": ["groq","gemini"] }
}
```

Provider free-tier limits hard-code trong `apps/gateway/src/lib/quota-tracker.ts`, sync từ `models.yaml`.

## Drizzle config

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

> **Tiếng Việt** | [🇬🇧 English](../en/GETTING_STARTED.md) | [Docs Index](../README.md)

# Bắt đầu cho người mới (5 phút)

> Dành cho bạn lần đầu chạy gateway — không cần biết code, chỉ cần copy lệnh.

## 1. Bạn cần gì?

- **Docker Desktop** (khuyến nghị) **hoặc** Node 20+ (`node -v`)
- **Không cần tạo key thủ công:** `MASTER_KEY` (1 key duy nhất cho `/v1/*` + `/api/*`) và `ENCRYPTION_KEY` (nội bộ AES-256-GCM) sẽ **tự sinh** lần đầu nếu thiếu/placeholder và lưu vào `.env` (hoặc `data/.gateway-keys.json` khi chạy Docker không có `.env`) — xem `docker compose logs gateway | grep MASTER_KEY`.
- **Provider keys là tùy chọn:** để trống vẫn chạy được `pollinations` (20b) qua `auto`. Có key sẽ hiện live models qua `?hasKey=1` (live sync 882 free).
- **Docs:** Root `README.md` mặc định English, `README.vi.md` Vietnamese; bạn đang ở `docs/vi/` (banner Tiếng Việt). UI có selector `VI/EN` ở header (persist `localStorage lang`) — `lib/i18n.tsx:1`.

## 2. Cài đặt nhanh (Docker) — 2 lệnh

```bash
# 1. Tải code
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free

# 2. Tạo file cấu hình (không cần sửa key — sẽ tự sinh)
cp .env.example .env
# Để trống GROQ_API_KEYS, GEMINI_API_KEYS... nếu chưa có — gateway vẫn chạy.

# 3. Chạy
docker compose up -d --build
docker compose logs -f gateway   # đợi thấy "🚀 Gateway listening on http://localhost:7373" + "Auto-generated MASTER_KEY=fgk-master-..."

# Kiểm tra
curl http://localhost:7373/v1/health
# Lấy MASTER_KEY đã sinh (dùng cho mọi endpoint /v1/* + /api/*)
grep MASTER_KEY .env
# hoặc: docker compose logs gateway | grep MASTER_KEY
```

Mở Dashboard: **http://localhost:3000** — header **2 hàng**: hàng 1 trái `⚡ Free LLM Gateway • 30 providers • 316 free` + `● online`, phải có selector `VI/EN` + ô **Master** (cùng hàng), hàng 2 nav `Dashboard→Providers→Models→Keys→Logs` căn giữa. Nếu ô **Master** trống, copy `MASTER_KEY` từ `.env`/logs dán vào (lưu localStorage). `ENCRYPTION_KEY` là nội bộ, tự sinh không cần nhập.

> Muốn tự đặt key: sửa `MASTER_KEY`/`ENCRYPTION_KEY` trong `.env` trước khi `compose up`, hoặc dùng Dashboard → **Keys → Key Generator** (tùy chọn, cho rotate).

## 3. Cài đặt không Docker (Node)

```bash
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free
cp .env.example .env
# không cần sửa MASTER_KEY/ENCRYPTION_KEY — sẽ tự sinh
npm install
npm run build
npm run dev:gateway   # http://localhost:7373 — xem log Auto-generated MASTER_KEY
npm run dev:web       # http://localhost:5173 (mở tab khác)
# Lấy key: grep MASTER_KEY .env
```

## 4. Gọi API ngay với 1 key duy nhất

`MASTER_KEY` (tự sinh trong `.env`) đã dùng được luôn cho **mọi endpoint** `/v1/*` + `/api/*` — không bắt buộc tạo thêm `fgk-...`. Tạo `fgk-...` chỉ khi cần key riêng per-app với scope/RPM khác.

**Dùng luôn MASTER_KEY (single-key, khuyến nghị dev):**

```bash
MASTER=$(grep MASTER_KEY .env | cut -d= -f2) # hoặc từ docker logs
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'
```

**Tạo scoped fgk-... (tùy chọn):**

*Dashboard:* Mở http://localhost:3000/keys → `MASTER_KEY` ở header đã có → Tên `my-app`, Scopes `{"models":["*"],"providers":["*"]}`, RPM `60` → **Create** → copy `fgk-...` (chỉ hiện 1 lần).

*curl:*

```bash
MASTER=fgk-master-xxx... # lấy từ .env
curl -X POST http://localhost:7373/api/keys \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app","scopes":{"models":["*"],"providers":["*"]},"rpmLimit":60}'
# -> {"key":"fgk-...","id":"vk-..."}
# Scope hẹp: -d '{"name":"pollinations-only","scopes":{"models":["*"],"providers":["pollinations"]}}'
```

## 5. Gọi thử API (3 cách)

### a) curl

```bash
KEY=fgk-... # vừa tạo
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'

# Pin provider (không cần key provider nếu là public)
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "x-router: pollinations" \
  -H "Content-Type: application/json" \
  -d '{"model":"pollinations/openai","messages":[{"role":"user","content":"Hi"}],"stream":false}'

# Streaming
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"haiku"}],"stream":true}'

# Models thực sự còn free — live cache (không phải freellms)
curl "http://localhost:7373/v1/models?hasKey=1&limit=25" -H "Authorization: Bearer $KEY" | head -c 500
# Freellms snapshot (lịch sử)
curl "http://localhost:7373/v1/models?verified=free&q=gemma&page=1&limit=25" -H "Authorization: Bearer $KEY" | head -c 500
# Providers có real key
curl "http://localhost:7373/api/providers?hasKey=1&q=nvidia" -H "Authorization: Bearer $MASTER" | jq
```

### b) OpenAI SDK (Node)

```ts
import OpenAI from "openai";
const client = new OpenAI({ baseURL:"http://localhost:7373/v1", apiKey:"fgk-..." });
const r = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"Hello"}] });
console.log(r.choices[0].message.content);
// Streaming
const s = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"haiku"}], stream:true });
for await(const c of s) process.stdout.write(c.choices[0]?.delta?.content||"");
// List models hasKey + pagination
const models = await (client as any).models.list({ hasKey: 1, limit: 25 });
```

### c) OpenAI SDK (Python)

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:7373/v1", api_key="fgk-...")
print(client.chat.completions.create(model="auto", messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
```

## 6. Thêm provider keys (tùy chọn, để dùng live 882 free)

Không có key → `auto` vẫn fallback tới `pollinations` (20b) sau ~10s và trả lời. Muốn dùng model riêng (ví dụ `nvidia-nim/z-ai/glm-5.2`):

1. Vào freellms.org/providers/nvidia-nim → **Get API Key** → tạo `nvapi-...`
2. Dán vào `.env` dòng `NVIDIA_API_KEYS=nvapi-...` (nhiều key cách nhau `,`) — lưu ý real key check loại `xxx`/`change-me` và length>20 cho `hasKey`
3. `docker compose restart gateway` hoặc `npm run dev:gateway` lại
4. Đồng bộ live: `POST /api/models/live/sync` (UI nút **Sync Live Now** chỉ pull freeOnly) — sau đó `GET /v1/models?hasKey=1` sẽ trả 2190 total từ live cache, `GET /api/providers?hasKey=1` sẽ highlight xanh lá `#f0fdf4` + viền `#16a34a` + `● has key` + `✓ real`
5. Kiểm tra `GET /api/providers/health` — provider đó sẽ chuyển `online`, `GET /api/verify/summary` sẽ tăng `verified_free`

Bảng 30 providers + link lấy key: xem `docs/PROVIDERS.md:1` (cột **Base URL**).

## 7. Dashboard walkthrough (nav: Dashboard → Providers → Models → Keys → Logs, header 2 hàng)

- **Header 2 hàng** ( `main.tsx:40` ): Hàng 1 trái `⚡ Free LLM Gateway` + `● online/offline` + `30 providers • 316 free`, phải `VI/EN` selector + **Master** input (cùng hàng, `justifyContent: space-between`). Hàng 2 nav 5 tabs `Dashboard→Providers→Models→Keys→Logs` căn giữa (`alignSelf: center`, `borderRadius:10`). Language persist `localStorage lang`, dịch nav + Models/Providers (`lib/i18n.tsx`).
- **`/` Dashboard** — 4 cards: Providers 43, Verify 314/316, Requests, **Tokens** (all-time + last 100 prompt/completion). Dưới là 3 charts: **Requests by Provider**, **Latency**, **Verify Pie** + Recent Logs (5) + **Tokens by Provider** bar.
- **`/providers`** — 43 dòng, `Free`, `Keys` (`✓ real` xanh khi hasRealKey), **Health** (`online`/`offline`/`no-key` + `breaker`), **Caps**, cột **Get Key ↗** (link thẳng console provider + freellms). Hàng có hasRealKey được highlight `background #f0fdf4`, `borderLeft 3px #16a34a`, badge `● has key` xanh lá. Top filter: `q` search (debounce 400ms) + pill `Chỉ hiện đã nhập key` (hasKey), **sticky bottom pagination** `‹ Prev / Next ›` + `Page X/Y` + `LOV 25/50` (không còn trên top filter). Nút **Sync Live Now** (freeOnly) + **Live Health Check** 43 providers 5s.
- **`/models`** — Live `882 free` / freellms `316 free`, **top filter bar** chỉ có: `Filter id/provider...` (debounce 400ms) + `verified` select (All/Verified free/Deprecated/Unverified) + 2 pill toggles bên phải `Chỉ hiện provider đã nhập key` (hasKey, xanh `#dcfce7`) + `Ẩn model 404` (hide404, đỏ `#fee2e2`, **mặc định checked**, persist `localStorage hide404/hide404_migrated`). **Hàng 2**: 3 nút căn giữa `Check Live (n)` (primary xanh + badge count) — `Sync Live Now` (xanh lá, freeOnly) — `Refresh` (trung tính). Bảng: checkbox per row + header chọn tất cả (disable khi 404/410 strikethrough `#dc2626` + `line-through`), cột **Used / Limit** (đếm từ logs vs `Up to 40 RPM`), **Live** (`✅ usable 123ms`/`no-key`/`unusable 410`). **Sticky bottom pagination** `Page X/Y` + `LOV 25/50` (đã dời khỏi top filter). 404 persisted trong `data/model-health.json` + localStorage, ẩn khi hide404 checked.
- **`/keys`** — **Key Generator** (thay `openssl`) ở trên cùng (Generate `MASTER_KEY`/`ENCRYPTION_KEY` client-side), dưới là CRUD `fgk-...` (name/scopes/RPM) + **Quick Test** `curl` với `$FGK_KEY` (auto + `x-router: pollinations`).
- **`/logs`** — 3 charts: **Requests by Provider** + **Tokens by Provider** + **Status Pie**, header `total • allTimeTokens • avg ms/tok`, table logs + **Live ON** (SSE + poll 2s, đã bỏ duplicate `Auto sync 5s`).

## 8. Lỗi thường gặp

> **Node 20–26 & `better-sqlite3`**: gateway dùng `better-sqlite3@^13.0.3` (`apps/gateway/package.json:34`) với prebuild cho Node 20–26 (ABI 115–147). Nếu `npm install` báo `gyp ERR!` / `v8-internal.h: concept/requires` trên Node 26, chạy `rm -rf node_modules package-lock.json && npm install` sau khi upgrade — Docker (`node:20-alpine`) không ảnh hưởng.

| Lỗi | Nguyên nhân | Sửa |
|-----|-------------|-----|
| `401 Invalid API key` | `fgk-...` sai hoặc chưa có `MASTER_KEY` | Dùng `MASTER_KEY` từ `.env` cho `/v1/*` (single-key) hoặc tạo `fgk-...` ở `/keys` |
| `403 Admin required` khi `POST /api/keys` | Dùng `fgk-...` user thay vì `MASTER_KEY` | Dùng `MASTER_KEY` cho `/api/keys` POST/DELETE |
| `403 Key not allowed for provider nvidia-nim` | Key scope chỉ `pollinations` mà `x-router: nvidia-nim` | Tạo key với `providers: ["*"]` hoặc `["nvidia-nim"]` |
| `429 Virtual key RPM limit 2 exceeded` | `rpmLimit` nhỏ, gọi quá nhanh / gõ search liên tục | Đã fix: search debounce 400ms + list endpoints 4x (200) trong `middleware/rate-limit.ts`; vẫn 429 thì tạo key mới `rpmLimit: 60` hoặc đợi 60s |
| `404 page not found` từ `nvidia-nim` | Thiếu `NVIDIA_API_KEYS` hoặc key placeholder `xxx` | Thêm real key (`!xxx`, length>20) hoặc dùng `x-router: pollinations`; check `GET /api/providers?hasKey=1` |
| `Models chỉ 7` | Chạy `npm run dev:gateway` cũ chưa rebuild sau fix `paths.ts` | `git pull && npm run build -w apps-gateway && docker compose up -d --build` + hard reload `Ctrl+Shift+R` |
| `Hide 404 không ẩn` | Chưa persist model-health | Tick checkbox rồi Check Live 410 → tự persist `data/model-health.json`; toggle `Ẩn model 404` mặc định checked |
| `verified 0/316` | Chưa có provider keys thật, scheduler chưa chạy | Đợi 5s sau khi start gateway (scheduler tự verify + syncLiveModels dry-run) hoặc `POST /api/verify` / `POST /api/models/live/sync` với `{"freeOnly":true}` — `ENCRYPTION_KEY` đã tự sinh, không cần nhập tay |
| `npm i` lỗi `better-sqlite3` / `node-gyp` / `v8-internal.h: concept` | Node 26 + `better-sqlite3@9` cũ không có prebuild (ABI 147) | Đã fix ở `^13.0.3`: `rm -rf node_modules package-lock.json && npm i`. Nếu vẫn lỗi, dùng Node 22 LTS (`brew install node@22`) hoặc `npm i --build-from-source` với Xcode CLT `xcode-select --install` |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN` | Sau corporate proxy SSL inspection (Zscaler) | Dev tạm uncomment `NODE_TLS_REJECT_UNAUTHORIZED=0` trong `.env` (mặc định comment), prod dùng `NODE_EXTRA_CA_CERTS=/path/to/ca.crt` để giữ verify |
| `EADDRINUSE :::7373` khi `npm run dev` | Gateway cũ vẫn chạy (`nohup npm run dev:gateway` hoặc `tsx watch` chưa kill) | `pkill -f "tsx watch"; lsof -ti:7373 \| xargs kill -9; sleep 2; lsof -i :7373` (trống) rồi `npm run dev` lại |

## 9. Lệnh hữu ích

```bash
# Kill gateway cũ nếu EADDRINUSE :::7373
pkill -f "tsx watch"; lsof -ti:7373 | xargs kill -9; sleep 2; lsof -i :7373

# Health
curl http://localhost:7373/v1/health
curl http://localhost:7373/api/providers/health -H "Authorization: Bearer $MASTER"
curl "http://localhost:7373/api/providers?hasKey=1&q=nvidia" -H "Authorization: Bearer $MASTER"

# Verify 24h + Live sync (source of truth mới)
curl http://localhost:7373/api/verify/summary -H "Authorization: Bearer $MASTER"
curl -X POST http://localhost:7373/api/verify -H "Authorization: Bearer $MASTER" -d '{"dryRun":true}'
curl http://localhost:7373/api/models/live -H "Authorization: Bearer $MASTER" | jq '.total'
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}' | jq

# Models live vs freellms
curl "http://localhost:7373/v1/models?hasKey=1&limit=25&q=gemma" -H "Authorization: Bearer $MASTER" | jq '.pagination'
curl "http://localhost:7373/v1/models?verified=free" -H "Authorization: Bearer $KEY" | head -c 500

# Logs & stats
curl "http://localhost:7373/api/logs?limit=5" -H "Authorization: Bearer $MASTER"
curl http://localhost:7373/api/stats -H "Authorization: Bearer $MASTER"

# Persisted 404
curl http://localhost:7373/api/models/health/persisted -H "Authorization: Bearer $MASTER" | jq

# Sync freellms (lịch sử, disabled — dùng live sync thay)
python scripts/sync-freellms.py
npm run verify:free:dry -w apps-gateway
npx tsx scripts/benchmark.ts --gateway http://localhost:7373 --key $MASTER

# Đổi MASTER_KEY / ENCRYPTION_KEY (tùy chọn — đã tự sinh, chỉ rotate khi cần)
grep MASTER_KEY .env
# Hoặc gen mới: openssl rand -hex 32 ; echo "fgk-master-$(openssl rand -hex 16)"
npx tsx scripts/rotate-keys.ts --old $OLD --new $NEW
```

Cần thêm? Mở Issue với `curl` + `docker compose logs` + `GET /api/verify/summary` + `GET /api/models/live`.

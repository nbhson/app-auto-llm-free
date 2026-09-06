> **Tiếng Việt** | [🇬🇧 English](../en/GETTING_STARTED.md) | [Docs Index](../README.md)

# Bắt đầu cho người mới (5 phút)

> Dành cho bạn lần đầu chạy gateway — không cần biết code, chỉ cần copy lệnh.

## 1. Bạn cần gì?

- **Docker Desktop** (khuyến nghị) **hoặc** Node 20+ (`node -v`)
- **2 key tự tạo** (không cần xin provider nào):
  - `MASTER_KEY` — key admin của gateway (bạn tự đặt, vd `fgk-master-...`)
  - `ENCRYPTION_KEY` — 64 hex để mã hóa (tạo bằng 1 lệnh)
- **Provider keys là tùy chọn:** để trống vẫn chạy được `pollinations` (20b) qua `auto`.

## 2. Cài đặt nhanh (Docker) — 3 lệnh

```bash
# 1. Tải code
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free

# 2. Tạo file cấu hình
cp .env.example .env

# 3. Tạo 2 key bắt buộc (chạy từng lệnh, copy kết quả dán vào .env)
openssl rand -hex 32
# -> vd a1b2c3...64 ký tự, dán vào dòng ENCRYPTION_KEY= trong .env

echo "fgk-master-$(openssl rand -hex 16)"
# -> vd fgk-master-8f3a9c... , dán vào dòng MASTER_KEY= trong .env

# Không có openssl (Windows): dùng Node
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('fgk-master-'+require('crypto').randomBytes(16).toString('hex'))"
```

Mở `.env` bằng Notepad/VS Code, thay 2 dòng:

```
MASTER_KEY=fgk-master-xxx... (bạn vừa tạo)
ENCRYPTION_KEY=a1b2...64 hex (bạn vừa tạo)
```

Để trống các dòng `GROQ_API_KEYS`, `GEMINI_API_KEYS`... nếu chưa có — gateway vẫn chạy.

```bash
# 4. Chạy
docker compose up -d --build
docker compose logs -f gateway   # đợi thấy "🚀 Gateway listening on http://localhost:8080"

# Kiểm tra
curl http://localhost:8080/v1/health
```

Mở Dashboard: **http://localhost:3000** — nhập `MASTER_KEY` vừa tạo vào ô **Master** góc phải header (lưu localStorage). Hoặc dùng Dashboard → **Key Generator** để tạo luôn (không cần `openssl`).

## 3. Cài đặt không Docker (Node)

```bash
git clone https://github.com/nbhson/app-auto-llm-free.git
cd app-auto-llm-free
cp .env.example .env
# sửa MASTER_KEY + ENCRYPTION_KEY như trên
npm install
npm run build
npm run dev:gateway   # http://localhost:8080
npm run dev:web       # http://localhost:5173 (mở tab khác)
```

## 4. Tạo key đầu tiên để gọi API (`fgk-...`)

**Cách 1 — Dashboard (dễ nhất):**

1. Mở http://localhost:3000/keys
2. Nhập `MASTER_KEY` ở header (nếu chưa)
3. Tên: `my-app` — Scopes: `{"models":["*"],"providers":["*"]}` — RPM: `60` → **Create**
4. Copy `fgk-...` hiện ra (chỉ hiện 1 lần!)

**Cách 2 — curl:**

```bash
MASTER=fgk-master-xxx... # lấy từ .env
curl -X POST http://localhost:8080/api/keys \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app","scopes":{"models":["*"],"providers":["*"]},"rpmLimit":60}'
# -> {"key":"fgk-...","id":"vk-..."}
```

Scope hẹp ví dụ chỉ cho pollinations:

```bash
-d '{"name":"pollinations-only","scopes":{"models":["*"],"providers":["pollinations"]}}'
```

## 5. Gọi thử API (3 cách)

### a) curl

```bash
KEY=fgk-... # vừa tạo
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'

# Pin provider (không cần key provider nếu là public)
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "x-router: pollinations" \
  -H "Content-Type: application/json" \
  -d '{"model":"pollinations/openai","messages":[{"role":"user","content":"Hi"}],"stream":false}'

# Streaming
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"haiku"}],"stream":true}'

# Models thực sự còn free (24h probe)
curl "http://localhost:8080/v1/models?verified=free" -H "Authorization: Bearer $KEY" | head -c 500
```

### b) OpenAI SDK (Node)

```ts
import OpenAI from "openai";
const client = new OpenAI({ baseURL:"http://localhost:8080/v1", apiKey:"fgk-..." });
const r = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"Hello"}] });
console.log(r.choices[0].message.content);
// Streaming
const s = await client.chat.completions.create({ model:"auto", messages:[{role:"user",content:"haiku"}], stream:true });
for await(const c of s) process.stdout.write(c.choices[0]?.delta?.content||"");
```

### c) OpenAI SDK (Python)

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="fgk-...")
print(client.chat.completions.create(model="auto", messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
```

## 6. Thêm provider keys (tùy chọn, để dùng đủ 316 models)

Không có key → `auto` vẫn fallback tới `pollinations` (20b) sau ~10s và trả lời. Muốn dùng model riêng (ví dụ `nvidia-nim/z-ai/glm-5.2`):

1. Vào freellms.org/providers/nvidia-nim → **Get API Key** → tạo `nvapi-...`
2. Dán vào `.env` dòng `NVIDIA_API_KEYS=nvapi-...` (nhiều key cách nhau `,`)
3. `docker compose restart gateway` hoặc `npm run dev:gateway` lại
4. Kiểm tra `GET /api/providers/health` — provider đó sẽ chuyển `online`, `GET /api/verify/summary` sẽ tăng `verified_free`

Bảng 30 providers + link lấy key: xem `docs/PROVIDERS.md:1` (cột **Base URL**).

## 7. Dashboard walkthrough (nav: Dashboard → Providers → Models → Keys → Logs)

- **`/` Dashboard** — 4 cards: Providers 40, Verify 314/316, Requests, **Tokens** (all-time + last 100 prompt/completion). Dưới là 3 charts: **Requests by Provider**, **Latency**, **Verify Pie** + Recent Logs (5) + **Tokens by Provider** bar. Header có `MASTER_KEY` input + `Key Generator` đã move sang **Keys**.
- **`/providers`** — 43 dòng, `Free`, `Keys`, **Health** (`online`/`offline`/`no-key` + `breaker`), **Caps**, cột **Get Key ↗** (link thẳng console provider + freellms). Nút **Live Health Check** 43 providers 5s.
- **`/models`** — 316 free, filter `id/provider` (vd `nvidia-nim`), `verified` (xanh/đỏ/vàng), **checkbox** per row + header chọn tất cả, **1 nút duy nhất** `Check Live (n)` cho các model đã tick (hiện `✅ usable 123ms`/`no-key`/`unusable 410`), cột **Used / Limit** (đếm từ logs vs `Up to 40 RPM`).
- **`/keys`** — **Key Generator** (thay `openssl`) ở trên cùng (Generate `MASTER_KEY`/`ENCRYPTION_KEY` client-side), dưới là CRUD `fgk-...` (name/scopes/RPM) + **Quick Test** `curl` với `$FGK_KEY` (auto + `x-router: pollinations`).
- **`/logs`** — 3 charts: **Requests by Provider** + **Tokens by Provider** + **Status Pie**, header `total • allTimeTokens • avg ms/tok`, table logs + Live SSE.

## 8. Lỗi thường gặp

| Lỗi | Nguyên nhân | Sửa |
|-----|-------------|-----|
| `401 Invalid API key` | Dùng `MASTER_KEY` cho `/v1/chat/completions` thay vì `fgk-...`, hoặc `fgk-...` chưa tạo | Tạo key mới ở `/keys` và dùng `fgk-...` đó cho `/v1/*` |
| `403 Admin required` khi `POST /api/keys` | Dùng `fgk-...` user thay vì `MASTER_KEY` | Dùng `MASTER_KEY` cho `/api/keys` POST/DELETE |
| `403 Key not allowed for provider nvidia-nim` | Key scope chỉ `pollinations` mà `x-router: nvidia-nim` | Tạo key với `providers: ["*"]` hoặc `["nvidia-nim"]` |
| `429 Virtual key RPM limit 2 exceeded` | `rpmLimit` nhỏ, gọi quá nhanh | Tạo key mới với `rpmLimit: 60` hoặc đợi 60s |
| `404 page not found` từ `nvidia-nim` | Thiếu `NVIDIA_API_KEYS` | Thêm key hoặc dùng `x-router: pollinations` để test không cần key |
| `Models chỉ 7` | Chạy `npm run dev:gateway` cũ chưa rebuild sau fix `paths.ts` | `git pull && npm run build -w apps-gateway && docker compose up -d --build` + hard reload `Ctrl+Shift+R` |
| `verified 0/316` | Chưa có `ENCRYPTION_KEY`/provider keys, scheduler chưa chạy | Đợi 5s sau khi start gateway (scheduler tự verify dry-run) hoặc `POST /api/verify` với `{"dryRun":true}` |

## 9. Lệnh hữu ích

```bash
# Health
curl http://localhost:8080/v1/health
curl http://localhost:8080/api/providers/health -H "Authorization: Bearer $MASTER"

# Verify 24h
curl http://localhost:8080/api/verify/summary -H "Authorization: Bearer $MASTER"
curl -X POST http://localhost:8080/api/verify -H "Authorization: Bearer $MASTER" -d '{"dryRun":true}'

# Logs & stats
curl "http://localhost:8080/api/logs?limit=5" -H "Authorization: Bearer $MASTER"
curl http://localhost:8080/api/stats -H "Authorization: Bearer $MASTER"

# Sync freellms thủ công
python scripts/sync-freellms.py
npm run verify:free:dry -w apps-gateway
npx tsx scripts/benchmark.ts --gateway http://localhost:8080 --key $MASTER

# Đổi MASTER_KEY / ENCRYPTION_KEY
openssl rand -hex 32
echo "fgk-master-$(openssl rand -hex 16)"
npx tsx scripts/rotate-keys.ts --old $OLD --new $NEW
```

Cần thêm? Mở Issue với `curl` + `docker compose logs` + `GET /api/verify/summary`.

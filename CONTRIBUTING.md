# Contributing

Cảm ơn bạn quan tâm đóng góp cho `app-auto-llm-free`!

## Quy trình

1. Fork repo, tạo branch `feat/<ten-tinh-nang>` hoặc `fix/<ten-loi>`.
2. Cài đặt: `npm install && cp .env.example .env` — yêu cầu **Node >= 22** (`node -v`) + npm >= 10 — điền ít nhất 1 provider key để test live.
3. Code + test local:

```bash
npm run typecheck        # hoặc tsc --noEmit -p apps/gateway/tsconfig.json
npm run build -w apps-gateway
npm run verify:free:dry -w apps-gateway  # dry-run verify 316 models
npm run dev:gateway      # kiểm tra /v1/health, /v1/models?verified=free
```

4. Thêm provider mới: xem `docs/PROVIDERS.md:1` section 5.
5. Commit theo Conventional Commits: `feat(gateway): add groq adapter`, `fix(router): fallback on 429`.
6. Push và mở PR vào `main`, mô tả rõ provider/model thêm, kèm test `curl` hoặc SDK snippet, và kết quả `verify:free`.
7. CI phải pass (`typecheck`, `build`), cần ít nhất 1 review.

## Thêm provider mới

Xem `docs/PROVIDERS.md:1` section 5. Yêu cầu:

* Implement `Provider` interface (`apps/gateway/src/providers/base.ts:1`), có `models()` và `health()` test được (hỗ trợ no-key nếu là public như LLM7).
* Thêm env vào `.env.example` (ví dụ `MY_PROVIDER_API_KEYS`) và vào `apps/gateway/src/config.ts:19` `providerKeys`.
* Đăng ký trong `apps/gateway/src/providers/registry.ts:1` (kèm `providerMeta` caps/tier).
* Chạy `python scripts/sync-freellms.py` nếu provider có trên freellms.org để cập nhật `data/` + `models.yaml`.
* Chạy `npm run verify:free:dry -w apps-gateway` và kiểm tra `data/verified-models.json` không tăng `deprecated` bất thường.
* Thêm test trong `apps/gateway/tests/providers/<id>.test.ts` (nếu có).
* Cập nhật `docs/PROVIDERS.md:1` bảng và `docs/FREELLMS_FREE_TIER.md:1` nếu cần.

## Sync freellms (24h)

```bash
python scripts/sync-freellms.py          # fetch freellms.org -> data/*.json + models.yaml
npm run verify:free -w apps-gateway      # live probe (cần .env keys)
npm run verify:free:dry -w apps-gateway  # dry-run cho CI
```

Xem `docs/OPERATIONS.md:1` để hiểu 2-layer sync (freellms + live verify) và scheduler 24h.

## Báo lỗi

Mở Issue với: mô tả, steps to reproduce, `curl` request, logs gateway (`docker compose logs`), và output `GET /api/verify/summary` nếu liên quan free tier.

## Code style

* TypeScript strict, `eslint` + `prettier`.
* Ưu tiên `fetch` native + `hono/proxy`, không thêm `axios`/`got`.
* Không commit secret (`*.env`, `data.db`, `data/verified-models.json` nếu chứa key — hiện chỉ chứa status, an toàn).

## License

Đóng góp của bạn sẽ được cấp phép Apache-2.0 như repo.

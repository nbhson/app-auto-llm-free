# Contributing

Cảm ơn bạn quan tâm đóng góp cho `app-auto-llm-free`!

## Quy trình

1. Fork repo, tạo branch `feat/<ten-tinh-nang>` hoặc `fix/<ten-loi>`.
2. `bun install && cp .env.example .env`
3. Code + test local:

```bash
bun run lint
bun run typecheck
bun run test
bun run dev:gateway # kiểm tra /v1/health
```

4. Commit theo Conventional Commits: `feat(gateway): add groq adapter`, `fix(router): fallback on 429`.
5. Push và mở PR vào `main`, mô tả rõ provider/model thêm, kèm test `curl` hoặc SDK snippet.
6. CI phải pass, cần ít nhất 1 review.

## Thêm provider mới

Xem `docs/PROVIDERS.md` section 3. Yêu cầu:

* Implement `Provider` interface, có `health()` test được.
* Thêm vào `registry.ts` + `.env.example` + `models.yaml`.
* Thêm test trong `apps/gateway/tests/providers/<id>.test.ts`.
* Cập nhật `docs/PROVIDERS.md` bảng.

## Báo lỗi

Mở Issue với: mô tả, steps to reproduce, `curl` request, logs gateway (`docker compose logs`).

## Code style

* TypeScript strict, `eslint` + `prettier`.
* Ưu tiên `fetch` native + `hono/proxy`, không thêm axios/got.
* Không commit secret (`*.env`, `data.db`).

## License

Đóng góp của bạn sẽ được cấp phép Apache-2.0 như repo.

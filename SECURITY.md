# Security Policy

## Hỗ trợ phiên bản

| Version | Supported |
|---------|-----------|
| main    | ✅        |

## Báo cáo lỗ hổng

Vui lòng **không** mở public issue cho lỗ hổng bảo mật. Gửi email tới maintainer hoặc mở private security advisory trên GitHub.

Chúng tôi sẽ phản hồi trong 48h và fix trong 7 ngày nếu confirmed.

## Thực hành bảo mật trong gateway

* **Encryption at rest**: Provider keys mã hóa AES-256-GCM với `ENCRYPTION_KEY` (32 bytes hex). Không lưu plaintext.
* **Virtual keys**: lưu hash SHA-256, so sánh timing-safe.
* **Master key**: `MASTER_KEY` chỉ dùng để bootstrap, nên rotate định kỳ.
* **Rate limit**: Redis rolling window, trả `Retry-After`, chống brute-force.
* **CORS**: cấu hình `CORS_ORIGIN` cụ thể ở production, không để `*`.
* **Body limit**: 10MB mặc định (`hono/body-limit`), chống payload lớn.
* **Logs**: không log `Authorization` header, chỉ log hash prefix `fgk-abc...`.

## Rotation

```bash
# Tạo key mới
openssl rand -hex 32  # ENCRYPTION_KEY
openssl rand -hex 16  # MASTER_KEY suffix

# Sau khi đổi ENCRYPTION_KEY, chạy migration re-encrypt:
bun run keys:reencrypt --old-key $OLD --new-key $NEW
```

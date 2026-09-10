# Documentation / Tài liệu

**Choose language / Chọn ngôn ngữ:**

* 🇻🇳 **Tiếng Việt** — [GETTING_STARTED](vi/GETTING_STARTED.md) | [API](vi/API.md) | [ARCHITECTURE](vi/ARCHITECTURE.md) | [PROVIDERS](vi/PROVIDERS.md) | [CONFIGURATION](vi/CONFIGURATION.md) | [OPERATIONS](vi/OPERATIONS.md) | [DEPLOYMENT](vi/DEPLOYMENT.md) | [PRODUCTION](en/PRODUCTION.md) | [FREELLMS_FREE_TIER](vi/FREELLMS_FREE_TIER.md) | [ROADMAP](vi/ROADMAP.md)
* 🇬🇧 **English** — [GETTING_STARTED](en/GETTING_STARTED.md) | [API](en/API.md) | [ARCHITECTURE](en/ARCHITECTURE.md) | [PROVIDERS](en/PROVIDERS.md) | [CONFIGURATION](en/CONFIGURATION.md) | [OPERATIONS](en/OPERATIONS.md) | [DEPLOYMENT](en/DEPLOYMENT.md) | [PRODUCTION](en/PRODUCTION.md) | [FREELLMS_FREE_TIER](en/FREELLMS_FREE_TIER.md) | [ROADMAP](en/ROADMAP.md)

---

* **VI:** Toàn bộ tài liệu gốc tiếng Việt nằm trong [`docs/vi/`](vi/GETTING_STARTED.md) — cập nhật mới nhất (pagination 25/50, persisted 404 strikethrough, header 2 hàng, 41 providers/324 models).
* **EN:** English docs in [`docs/en/`](en/GETTING_STARTED.md) — translated from VI, PRs welcome for better translation.
* **Root `docs/*.md` removed 2026-09-07 — only `README.md` + `EVIDENCE.md` remain at root; all guides now live in `vi/` (source) and `en/` (translation). Old links `/docs/API.md` → use `/docs/vi/API.md` or `/docs/en/API.md`.

**Gateway:** `GET /docs` -> redirect to `/docs/vi` (or `/docs/en` via `Accept-Language`).

**Sync:** `python scripts/sync-freellms.py` updates `data/*.json` + `models.yaml`; docs `vi/en` should be updated together when API changes.

# Contributing

Thanks for your interest in contributing to `app-auto-llm-free`!

## Process

1. Fork the repo, create a branch `feat/<feature-name>` or `fix/<bug-name>`.
2. Setup: `npm install && cp .env.example .env` — requires **Node >= 22** (`node -v`) + npm >= 10 — add at least 1 provider key for live testing.
3. Code + local testing:

```bash
npm run typecheck        # or tsc --noEmit -p apps/gateway/tsconfig.json
npm run build -w apps-gateway
npm run verify:free:dry -w apps-gateway  # dry-run verify 316 models
npm run dev:gateway      # test /v1/health, /v1/models?verified=free
```

4. Adding a new provider: see `docs/PROVIDERS.md:1` section 5.
5. Commit using Conventional Commits: `feat(gateway): add groq adapter`, `fix(router): fallback on 429`.
6. Push and open PR to `main`, describe the provider/model added, include test `curl` or SDK snippet, and `verify:free` results.
7. CI must pass (`typecheck`, `build`), at least 1 review required.

## Adding a New Provider

See `docs/PROVIDERS.md:1` section 5. Requirements:

* Implement `Provider` interface (`apps/gateway/src/providers/base.ts:1`), with `models()` and `health()` (support no-key for public like LLM7).
* Add env to `.env.example` (e.g. `MY_PROVIDER_API_KEYS`) and to `apps/gateway/src/config.ts:19` `providerKeys`.
* Register in `apps/gateway/src/providers/registry.ts:1` (with `providerMeta` caps/tier).
* Run `python scripts/sync-freellms.py` if provider is on freellms.org to update `data/` + `models.yaml`.
* Run `npm run verify:free:dry -w apps-gateway` and check `data/verified-models.json` for unexpected `deprecated` increases.
* Add test in `apps/gateway/tests/providers/<id>.test.ts` (if applicable).
* Update `docs/PROVIDERS.md:1` table and `docs/FREELLMS_FREE_TIER.md:1` if needed.

## Sync freellms (24h)

```bash
python scripts/sync-freellms.py          # fetch freellms.org -> data/*.json + models.yaml
npm run verify:free -w apps-gateway      # live probe (needs .env keys)
npm run verify:free:dry -w apps-gateway  # dry-run for CI
```

See `docs/OPERATIONS.md:1` for 2-layer sync (freellms + live verify) and 24h scheduler.

## Bug Reports

Open an Issue with: description, steps to reproduce, `curl` request, gateway logs (`docker compose logs`), and `GET /api/verify/summary` output if related to free tier.

## Code Style

* TypeScript strict, `eslint` + `prettier`.
* Prefer native `fetch` + `hono/proxy`, avoid adding `axios`/`got`.
* No secrets in commits (`*.env`, `data.db`, `data/verified-models.json` if containing keys — currently only status, safe).

## License

Your contribution will be licensed under Apache-2.0, same as the repo.
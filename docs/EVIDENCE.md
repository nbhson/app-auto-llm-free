# Evidence Sources — 24h Verify

> Nguồn live 2026-09 cho tính năng **verify 24h** (`jobs/verify-free.ts` + `jobs/scheduler.ts`). Mỗi khi `POST /api/verify` hoặc `scheduler` 24h chạy, gateway sẽ **probe live `/v1/models` + `/api/models/health`**, đồng thời đối chiếu với docs chính thức dưới đây để quyết định `verified_free` vs `deprecated`.

File máy đọc: `data/evidence-sources.json` (36 providers → 40 `providerIds` với alias, `312 models`, `generated_at` 2026-09-07). File này được `verify-free.ts` load để log khi live probe khác với docs (ví dụ freellms nói free nhưng docs đã paid-only). Đủ cho `312 models` vì mỗi model kế thừa evidence của provider (ví dụ `groq/llama-3.3-70b-versatile` dùng evidence `groq`).

## Index (per provider, live 2026) — 36 unique, 40 với alias `chutes`/`huggingface`/`mistral`/`gemini`/`nvidia`

- **NVIDIA NIM (97 models):** https://build.nvidia.com/models, https://docs.api.nvidia.com/nim/reference/models-1, https://github.com/adityonugrohoid/nim-explorer/blob/main/docs/api-reference.md
- **Google Gemini (10):** https://ai.google.dev/gemini-api/docs/models, https://ai.google.dev/gemini-api/docs/pricing, https://kunavo.com/guides/gemini-api-pricing-2026, https://questloops.com/blog/how-to-use-google-gemini-for-free-in-2026-api-limits-explained
- **OpenRouter (17):** https://openrouter.ai/collections/free-models, https://buldrr.com/openrouter-free-models-list-2026-all-27-models-ranked-tested/, https://github.com/ClawLabsAI/free-ai-models
- **Groq (12):** https://console.groq.com/docs/models, https://console.groq.com/docs/deprecations, https://console.groq.com/docs/api-reference, https://console.groq.com/docs/rate-limits
- **Cerebras (3):** https://inference-docs.cerebras.ai/models/overview, https://pricepertoken.com/endpoints/cerebras/free
- **ModelScope (43):** https://api-inference.modelscope.cn/v1, https://freellm.net/providers/modelscope
- **Cloudflare Workers AI (35):** https://developers.cloudflare.com/workers-ai/models/, https://ai.flared.au/
- **OpenCode Zen (7):** https://opencode.ai/docs/zen, https://opencode.ai/en/docs/zen, https://pi.dev/models/opencode/mimo-v2-5-free
- **Together/Fireworks/Novita (trial):** https://pricepertoken.com/endpoints/together/free, https://pricepertoken.com/endpoints/fireworks/free, https://pricepertoken.com/endpoints/novita/free
- **Cohere (10):** https://docs.cohere.com/docs/models, https://docs.cohere.com/docs/command-a-plus
- **Mistral AI (9):** https://docs.mistral.ai/models, https://pricepertoken.com/endpoints/mistral/free
- **Hugging Face (4):** https://huggingface.co/docs/inference-providers/index, https://huggingface.co/docs/inference-providers/en/index
- **GitHub Models retirement (13 deprecated):** https://docs.github.com/en/github-models, https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/, https://toolfreebie.com/github-models-free-api (410 Gone)
- **SambaNova (4):** https://freellm.net/providers/sambanova, https://pricepertoken.com/endpoints/sambanova/free
- **OVHcloud (10):** https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/, https://freellm.net/providers/ovhcloud-ai-endpoints
- **SiliconFlow (2 → 12 `免费`):** https://www.siliconflow.com/models, https://freellm.net/providers/siliconflow
- **Agnes AI (5), Aion Labs (5), Z.ai (4), Grok-xAI (2), Chutes.ai (2), Pollinations (1), OrcaRouter (2), FreeAI (346), Cline (tool), DeepSeek (0), Ollama Cloud (3):** https://wiki.agnes-ai.com/en/docs/pricing, https://www.aionlabs.ai/pricing, https://z.ai/model-api, https://docs.x.ai/developers/pricing, https://chutes.ai/pricing, https://text.pollinations.ai/openai, https://www.orcarouter.ai/models/orcarouter/free, https://free.ai/api?lang=ro, https://cline.bot/pricing, https://api-docs.deepseek.com/quick_start/pricing, https://ollama.com/pricing
- **Free list meta:** https://freeinference.dev/ (2026-09-05 13 providers 81 models)

## Cách dùng trong verify 24h

1. **Live probe** `jobs/verify-free.ts` gọi `provider.models()` + `provider.chat` với `max_tokens:5` cho từng `models.yaml` id → `verified_free` / `deprecated` / `unverified_no_key`.
2. **Đối chiếu** với `evidence-sources.json` — nếu docs nói `paid-only` nhưng live vẫn `verified_free` thì log warning để bạn cập nhật `models.yaml`.
3. **Persist** `data/verified-models.json` + `data/model-health.json` để UI filter `verified`/`hide404` hoạt động.

Cập nhật: chạy `websearch "<provider> free tier 2026"` và sửa `data/evidence-sources.json` + `models.yaml` khi provider đổi pricing.

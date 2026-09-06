# Provider Test Results

Generated: 2026-09-06T08:26:25.499Z
Gateway: http://localhost:18089

## Health Summary

- Total: 40
- Online: 13
- Offline: 25
- No-key: 0
- Breaker open: 0

## Chat Latency (pollinations)

- Status: ok (200)
- Latency: 1539ms

## Models

- Total (with alias): 320
- Free (freellms): 316
- Verified (24h): 314/316

## Providers

| Provider | Status | Latency | Breaker |
|----------|--------|---------|---------|
| agnes-ai | offline | 400ms | closed |
| ai21-labs | offline | 769ms | closed |
| aion-labs | offline | 642ms | closed |
| alibaba-cloud-model-studio | offline | 698ms | closed |
| cerebras | offline | 359ms | closed |
| chutes | offline | 415ms | closed |
| chutes-ai | offline | 427ms | closed |
| cloudflare-workers-ai | offline | 289ms | closed |
| cohere | offline | 432ms | closed |
| deepseek | offline | 439ms | closed |
| fireworks | offline | 559ms | closed |
| gemini | offline | 460ms | closed |
| github-models | offline | 888ms | closed |
| glhf | error | 5000ms | closed |
| glhf-chat | error | 5000ms | closed |
| google-gemini | offline | 458ms | closed |
| grok-xai | offline | 545ms | closed |
| groq | offline | 355ms | closed |
| hugging-face | online | 506ms | closed |
| huggingface | online | 485ms | closed |
| kilo-code | online | 599ms | closed |
| llm7-io | online | 574ms | closed |
| mistral | offline | 465ms | closed |
| mistral-ai | offline | 464ms | closed |
| modelscope | online | 3282ms | closed |
| nebius | offline | 1255ms | closed |
| novita | online | 781ms | closed |
| nscale | offline | 330ms | closed |
| nvidia | online | 657ms | closed |
| nvidia-nim | online | 346ms | closed |
| ollama-cloud | online | 1243ms | closed |
| opencode | online | 1027ms | closed |
| openrouter | online | 881ms | closed |
| ovhcloud-ai-endpoints | offline | 768ms | closed |
| pollinations | online | 783ms | closed |
| sambanova | online | 353ms | closed |
| siliconflow | offline | 438ms | closed |
| together | offline | 789ms | closed |
| xai | offline | 545ms | closed |
| z-ai-zhipu-ai | offline | 483ms | closed |

## Verified Summary

```json
{
  "generated_at": "2026-09-06T08:01:55.995Z",
  "total_freellms_free": 316,
  "total_verified_free": 314,
  "total_deprecated": 0,
  "total_unverified_no_key": 0,
  "providers": [
    {
      "id": "nvidia-nim",
      "freellms_free": 97,
      "live_models": 97,
      "verified_free": 97,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "groq",
      "freellms_free": 7,
      "live_models": 7,
      "verified_free": 7,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "cerebras",
      "freellms_free": 5,
      "live_models": 5,
      "verified_free": 5,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "github-models",
      "freellms_free": 13,
      "live_models": 13,
      "verified_free": 13,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "ovhcloud-ai-endpoints",
      "freellms_free": 10,
      "live_models": 10,
      "verified_free": 10,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "cohere",
      "freellms_free": 10,
      "live_models": 10,
      "verified_free": 10,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "mistral-ai",
      "freellms_free": 9,
      "live_models": 9,
      "verified_free": 9,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "cloudflare-workers-ai",
      "freellms_free": 35,
      "live_models": 35,
      "verified_free": 35,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "modelscope",
      "freellms_free": 43,
      "live_models": 43,
      "verified_free": 43,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "chutes-ai",
      "freellms_free": 2,
      "live_models": 2,
      "verified_free": 2,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "sambanova",
      "freellms_free": 4,
      "live_models": 4,
      "verified_free": 4,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "siliconflow",
      "freellms_free": 2,
      "live_models": 2,
      "verified_free": 2,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "glhf-chat",
      "freellms_free": 2,
      "live_models": 2,
      "verified_free": 2,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "hugging-face",
      "freellms_free": 4,
      "live_models": 4,
      "verified_free": 4,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "kilo-code",
      "freellms_free": 8,
      "live_models": 8,
      "verified_free": 8,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "opencode",
      "freellms_free": 8,
      "live_models": 8,
      "verified_free": 8,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "llm7-io",
      "freellms_free": 6,
      "live_models": 6,
      "verified_free": 6,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "agnes-ai",
      "freellms_free": 5,
      "live_models": 5,
      "verified_free": 5,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "aion-labs",
      "freellms_free": 5,
      "live_models": 5,
      "verified_free": 5,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "z-ai-zhipu-ai",
      "freellms_free": 4,
      "live_models": 4,
      "verified_free": 4,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "openrouter",
      "freellms_free": 17,
      "live_models": 17,
      "verified_free": 17,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "ollama-cloud",
      "freellms_free": 3,
      "live_models": 3,
      "verified_free": 3,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "together",
      "freellms_free": 0,
      "live_models": 0,
      "verified_free": 0,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "fireworks",
      "freellms_free": 0,
      "live_models": 0,
      "verified_free": 0,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "novita",
      "freellms_free": 0,
      "live_models": 0,
      "verified_free": 0,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "google-gemini",
      "freellms_free": 15,
      "live_models": 15,
      "verified_free": 15,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    },
    {
      "id": "pollinations",
      "freellms_free": 0,
      "live_models": 0,
      "verified_free": 0,
      "deprecated": 0,
      "unverified_no_key": false,
      "latency_ms": 0
    }
  ]
}
```

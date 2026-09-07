#!/usr/bin/env npx tsx
// Benchmark 30 providers: health latency + (optional) chat latency if keys present
// Usage: npx tsx scripts/benchmark.ts [--gateway http://localhost:7373 --key fgk-master-...]

import fs from "node:fs";

const GATEWAY = process.env.GATEWAY_URL || process.argv.find((a) => a.startsWith("--gateway="))?.split("=")[1] || "http://localhost:7373";
const MASTER = process.env.MASTER_KEY || process.argv.find((a) => a.startsWith("--key="))?.split("=")[1] || "fgk-master-change-me-please-generate-a-secure-random-key";

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, json: JSON.parse(text), text }; } catch { return { ok: res.ok, status: res.status, json: null, text }; }
}

async function main() {
  console.log(`Benchmark gateway ${GATEWAY} with key ${MASTER.slice(0, 8)}...`);
  const health = await fetchJson(`${GATEWAY}/api/providers/health`, { headers: { Authorization: `Bearer ${MASTER}` } });
  if (!health.ok) {
    console.error("Health failed", health.status, health.text.slice(0, 500));
    process.exit(1);
  }
  const providers = health.json.providers || [];
  console.log(`Health: ${health.json.summary.online} online / ${health.json.summary.total} total`);

  // Chat benchmark (only if pollinations public works, no key needed)
  const chatStart = Date.now();
  const chat = await fetchJson(`${GATEWAY}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MASTER}`, "Content-Type": "application/json", "x-router": "pollinations" },
    body: JSON.stringify({ model: "pollinations/openai", messages: [{ role: "user", content: "Hello benchmark" }], max_tokens: 10, stream: false }),
  });
  const chatLatency = Date.now() - chatStart;
  console.log(`Chat pollinations: ${chat.ok ? "ok" : "fail"} ${chatLatency}ms`);

  // Models count
  const models = await fetchJson(`${GATEWAY}/v1/models`, { headers: { Authorization: `Bearer ${MASTER}` } });
  const verified = await fetchJson(`${GATEWAY}/api/verify/summary`, { headers: { Authorization: `Bearer ${MASTER}` } });

  const report = {
    generated_at: new Date().toISOString(),
    gateway: GATEWAY,
    health: health.json.summary,
    providers: providers.map((p: any) => ({ id: p.id, status: p.status, latency_ms: p.latency_ms, breaker: p.breaker })),
    chat: { ok: chat.ok, latency_ms: chatLatency, status: chat.status },
    models: { total: models.json?.total ?? 0, free: models.json?.free ?? 0 },
    verified: verified.json || null,
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/benchmark.json", JSON.stringify(report, null, 2));
  console.log("Saved data/benchmark.json");

  // Markdown
  let md = `# Provider Test Results

Generated: ${report.generated_at}
Gateway: ${GATEWAY}

## Health Summary

- Total: ${report.health.total}
- Online: ${report.health.online}
- Offline: ${report.health.offline}
- No-key: ${report.health.no_key}
- Breaker open: ${report.health.open_breaker}

## Chat Latency (pollinations)

- Status: ${report.chat.ok ? "ok" : "fail"} (${report.chat.status})
- Latency: ${report.chat.latency_ms}ms

## Models

- Total (with alias): ${report.models.total}
- Free (freellms): ${report.models.free}
- Verified (24h): ${report.verified?.total_verified_free ?? "n/a"}/${report.verified?.total_freellms_free ?? "n/a"}

## Providers

| Provider | Status | Latency | Breaker |
|----------|--------|---------|---------|
`;
  for (const p of report.providers) {
    md += `| ${p.id} | ${p.status} | ${p.latency_ms}ms | ${p.breaker} |\n`;
  }
  md += `\n## Verified Summary\n\n\`\`\`json\n${JSON.stringify(report.verified, null, 2)}\n\`\`\`\n`;

  fs.writeFileSync("PROVIDER_TEST_RESULTS.md", md);
  console.log("Saved PROVIDER_TEST_RESULTS.md");
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });

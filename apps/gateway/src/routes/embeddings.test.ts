import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { embeddingsRoute } from "./v1/embeddings.js";
import { providers } from "../providers/registry.js";
import { config } from "../config.js";

function okEmbeddings() {
  return new Response(
    JSON.stringify({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
      model: "cohere/embed",
      usage: { prompt_tokens: 2, total_tokens: 2 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("embeddings route", () => {
  const origCohere = providers["cohere"];

  // Hermetic: route skips providers with no configured key, which would fall
  // through to real network calls. Inject synthetic keys so mocks are always hit.
  // (key-manager caches states on first use, so inject before any request.)
  beforeAll(() => {
    for (const pid of ["cohere", "nvidia-nim"]) {
      if ((config.providerKeys[pid] || []).length === 0) {
        config.providerKeys[pid] = [`test-key-for-${pid}-0123456789abcdef`];
      }
    }
  });

  afterEach(() => {
    providers["cohere"] = origCohere;
  });

  it("rejects invalid body with 400", async () => {
    const res = await embeddingsRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto" }), // missing input
    });
    expect(res.status).toBe(400);
  });

  it("returns OpenAI-shape embeddings + X-Provider on success", async () => {
    providers["cohere"] = { ...origCohere, embeddings: async () => okEmbeddings() } as any;
    const res = await embeddingsRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", input: "hello world" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("cohere");
    const data: any = await res.json();
    expect(data.object).toBe("list");
    expect(data.data[0].embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("accepts array input", async () => {
    providers["cohere"] = { ...origCohere, embeddings: async () => okEmbeddings() } as any;
    const res = await embeddingsRoute.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "auto", input: ["a", "b"] }),
    });
    expect(res.status).toBe(200);
  });

  it("falls back to next embedding provider when first fails", async () => {
    const origNvidia = providers["nvidia-nim"];
    providers["cohere"] = {
      ...origCohere,
      embeddings: async () => new Response("down", { status: 500 }),
    } as any;
    providers["nvidia-nim"] = { ...origNvidia, embeddings: async () => okEmbeddings() } as any;
    try {
      const res = await embeddingsRoute.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "auto", input: "hi" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Provider")).toBe("nvidia-nim");
    } finally {
      providers["nvidia-nim"] = origNvidia;
    }
  });
});

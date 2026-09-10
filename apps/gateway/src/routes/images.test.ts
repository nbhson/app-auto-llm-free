import { resJson } from "../lib/types.js";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { imagesRoute } from "./v1/images.js";
import { providers } from "../providers/registry.js";
import { config } from "../config.js";

function okImages() {
  return new Response(
    JSON.stringify({ created: 1, data: [{ url: "https://img.test/1.png", revised_prompt: "a cat" }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("images route", () => {
  const origAgnes = providers["agnes-ai"];

  beforeAll(() => {
    // default model agnes-ai/agnes-image-2.1-flash routes to agnes-ai only;
    // ensure a key so the route does not skip to network fallbacks
    if ((config.providerKeys["agnes-ai"] || []).length === 0) {
      config.providerKeys["agnes-ai"] = ["test-key-for-agnes-ai-0123456789abcdef"];
    }
  });

  afterEach(() => {
    providers["agnes-ai"] = origAgnes;
  });

  it("rejects missing prompt with 400", async () => {
    const res = await imagesRoute.request("/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects n > 4 with 400", async () => {
    const res = await imagesRoute.request("/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "cat", n: 9 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns provider images + X-Provider on success", async () => {
    providers["agnes-ai"] = { ...origAgnes, images: async () => okImages() } as any;
    const res = await imagesRoute.request("/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "a cat", n: 1 }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Provider")).toBe("agnes-ai");
    const data = await resJson<{ data?: Array<{ url?: string }> }>(res);
    expect(data.data?.[0]?.url).toBe("https://img.test/1.png");
  });

  it("normalizes non-OpenAI shape to {created, data}", async () => {
    providers["agnes-ai"] = {
      ...origAgnes,
      images: async () => new Response(JSON.stringify({ url: "https://x/y.png" }), { status: 200 }),
    } as any;
    const res = await imagesRoute.request("/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "dog" }),
    });
    expect(res.status).toBe(200);
    const data = await resJson<{ data?: Array<{ url?: string }> }>(res);
    expect(data.data?.[0]?.url).toBe("https://x/y.png");
  });

  it("returns 502 provider_error when image provider fails (test env, no dev mock)", async () => {
    providers["agnes-ai"] = {
      ...origAgnes,
      images: async () => new Response("down", { status: 500 }),
    } as any;
    const res = await imagesRoute.request("/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "bird" }),
    });
    expect(res.status).toBe(502);
    const data = await resJson<{ error?: { type?: string } }>(res);
    expect(data.error?.type).toBe("provider_error");
  });
});

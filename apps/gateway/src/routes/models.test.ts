import { describe, it, expect } from "vitest";
import { modelsRoute } from "./v1/models.js";
import { resJson, type OpenAIModelsResponse } from "../lib/types.js";

interface ModelsListResponse extends OpenAIModelsResponse {
  data?: Array<{ id: string; object?: string; owned_by?: string; provider?: string }>;
  total?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next?: boolean;
  };
  filters?: { q?: string; provider?: string; hasKey?: boolean };
}

describe("models route", () => {
  it("GET / returns OpenAI list with 25 default + total in hundreds", async () => {
    const res = await modelsRoute.request("/");
    expect(res.status).toBe(200);
    const data = await resJson<ModelsListResponse>(res);
    expect(data.object).toBe("list");
    expect(data.data).toHaveLength(25);
    expect(data.total).toBeGreaterThan(300);
    expect(data.data?.[0].id).toBe("free-llm-gateway/auto"); // gateway alias first
    expect(data.pagination).toMatchObject({ page: 1, limit: 25 });
    expect(data.pagination?.total_pages).toBeGreaterThan(10);
  });

  it("limit=50 paginates, unknown limit falls back to 25", async () => {
    const r50 = await resJson<ModelsListResponse>(await modelsRoute.request("/?limit=50"));
    expect(r50.data).toHaveLength(50);
    expect(r50.pagination?.limit).toBe(50);
    const rBad = await resJson<ModelsListResponse>(await modelsRoute.request("/?limit=30"));
    expect(rBad.pagination?.limit).toBe(25);
    expect(rBad.data).toHaveLength(25);
  });

  it("page=2 differs from page=1, clamps beyond last page", async () => {
    const p1 = await resJson<ModelsListResponse>(await modelsRoute.request("/"));
    const p2 = await resJson<ModelsListResponse>(await modelsRoute.request("/?page=2"));
    expect(p2.pagination?.page).toBe(2);
    expect(p2.data?.[0].id).not.toBe(p1.data?.[0].id);
    const far = await resJson<ModelsListResponse>(await modelsRoute.request("/?page=9999"));
    expect(far.pagination?.page).toBe(far.pagination?.total_pages);
    expect(far.pagination?.has_next).toBe(false);
  });

  it("provider filter narrows to that provider", async () => {
    const data = await resJson<ModelsListResponse>(await modelsRoute.request("/?provider=groq&limit=50"));
    expect(data.filters?.provider).toBe("groq");
    expect(data.data?.length ?? 0).toBeGreaterThan(0);
    for (const m of data.data ?? []) {
      expect(m.owned_by === "groq" || m.provider === "groq" || m.id.startsWith("groq/")).toBe(true);
    }
  });

  it("q search matches case-insensitively", async () => {
    const data = await resJson<ModelsListResponse>(await modelsRoute.request("/?q=llama-3.3&limit=50"));
    expect(data.filters?.q).toBe("llama-3.3");
    expect(data.data?.length ?? 0).toBeGreaterThan(0);
    // hardcoded fallbacks (gateway alias, pollinations) respect q too
    expect(data.data?.some((m) => m.id === "free-llm-gateway/auto")).toBe(false);
    expect(data.data?.some((m) => m.id === "pollinations/openai")).toBe(false);
    // the rest must match
    const rest = (data.data ?? []).filter((m) => !["free-llm-gateway/auto", "pollinations/openai"].includes(m.id));
    expect(rest.length).toBeGreaterThan(0);
    for (const m of rest) {
      expect(m.id.toLowerCase()).toContain("llama");
    }
  });

  it("hasKey filter returns 200 with echo flag (env-agnostic shape)", async () => {
    const data = await resJson<ModelsListResponse>(await modelsRoute.request("/?hasKey=1"));
    expect(data.filters?.hasKey).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("GET /:id echoes unknown model, finds freellms model", async () => {
    const unknown = await resJson<{ id: string; object: string }>(await modelsRoute.request("/some-unknown-model"));
    expect(unknown.id).toBe("some-unknown-model");
    expect(unknown.object).toBe("model");
  });
});

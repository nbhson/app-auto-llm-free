import { Hono } from "hono";

export const embeddingsRoute = new Hono();

embeddingsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  // Stub for P1 — real proxy in P5
  return c.json({
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: Array(8).fill(0.01) }],
    model: body.model || "unknown",
    usage: { prompt_tokens: 5, total_tokens: 5 },
    _mock: true,
  });
});

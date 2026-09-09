import { describe, it, expect } from "vitest";
import { healthRoute } from "./v1/health.js";
import { providerIds } from "../providers/registry.js";

describe("health route", () => {
  it("GET / returns ok + version + provider count", async () => {
    const res = await healthRoute.request("/");
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("ok");
    expect(data.version).toBe("0.8.0");
    expect(data.providers).toBe(providerIds.length);
    expect(data.providers).toBeGreaterThan(30);
    expect(typeof data.uptime).toBe("number");
    expect(Array.isArray(data.tiers)).toBe(true);
    expect(typeof data.timestamp).toBe("string");
  });

  it("GET /ready returns ready true", async () => {
    const res = await healthRoute.request("/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: true });
  });
});

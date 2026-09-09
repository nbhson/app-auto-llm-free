import { describe, it, expect } from "vitest";
import { loadVerifiedMap, loadHealthMap, loadLiveModels, _resetModelStoreCache } from "./model-store.js";

describe("model-store", () => {
  it("loadVerifiedMap returns a Map (empty when no data files)", () => {
    _resetModelStoreCache();
    const m = loadVerifiedMap();
    expect(m instanceof Map).toBe(true);
  });

  it("TTL cache returns same reference within 5s", () => {
    _resetModelStoreCache();
    expect(loadVerifiedMap()).toBe(loadVerifiedMap());
    expect(loadHealthMap()).toBe(loadHealthMap());
  });

  it("_resetModelStoreCache invalidates", () => {
    const before = loadVerifiedMap();
    _resetModelStoreCache();
    expect(loadVerifiedMap()).not.toBe(before);
  });

  it("loadHealthMap returns Map, loadLiveModels maps live file when present", () => {
    _resetModelStoreCache();
    expect(loadHealthMap() instanceof Map).toBe(true);
    const live = loadLiveModels();
    expect(Array.isArray(live)).toBe(true);
    // apps/data/live-models.json exists after sync runs; fresh clones yield []
    for (const m of live) expect(m.live_status).toBe("live");
  });
});

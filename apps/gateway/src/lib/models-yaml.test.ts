import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadModelsYaml } from "./models-yaml.js";

describe("models catalog integrity", () => {
  it("loads all models from models/ (split) or legacy models.yaml — unique ids + required fields", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve("models.yaml"),
      path.resolve(process.cwd(), "models.yaml"),
      path.resolve(path.join(here, "../../../../models.yaml")),
      path.join(here, "../../../../models"),
    ];
    const yamlPath = candidates.find((p) => fs.existsSync(p));
    expect(yamlPath).toBeTruthy();

    const entries = loadModelsYaml();
    expect(entries.length).toBeGreaterThan(100);
    const ids = entries.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of entries) {
      expect(m.provider).toBeTruthy();
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
  });
});

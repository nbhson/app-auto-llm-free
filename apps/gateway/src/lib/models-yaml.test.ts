import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("models.yaml integrity", () => {
  it("has unique ids and required fields, no duplicate YAML keys", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve("models.yaml"),
      path.resolve(process.cwd(), "models.yaml"),
      path.resolve(path.join(here, "../../../../models.yaml")),
    ];
    const yamlPath = candidates.find((p) => fs.existsSync(p));
    expect(yamlPath).toBeTruthy();
    const raw = fs.readFileSync(yamlPath as string, "utf-8");
    const blocks = raw.split(/\n\s*-\s+id:\s*/);
    expect(blocks.length).toBeGreaterThan(100);
    const ids: string[] = [];
    for (let i = 1; i < blocks.length; i++) {
      const blk = blocks[i];
      const id = blk.match(/^"([^"]+)"/)?.[1] ?? blk.match(/^([^\s\n]+)/)?.[1];
      expect(id).toBeTruthy();
      if (id) ids.push(id);
      const keys = [...blk.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
      const dup = keys.filter((k, idx) => keys.indexOf(k) !== idx);
      expect(dup).toEqual([]);
      expect(blk).toMatch(/provider:/);
      expect(blk).toMatch(/score:/);
      expect(blk).toMatch(/tier:/);
      expect(blk).toMatch(/capabilities:/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

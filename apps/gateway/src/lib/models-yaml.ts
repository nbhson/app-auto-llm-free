import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "./paths.js";

export interface ModelListEntry {
  id: string;
  raw_id?: string;
  object?: string;
  owned_by: string;
  provider?: string;
  display_name?: string;
  context_length?: number;
  score?: number;
  tier?: unknown;
  freellms_verified?: boolean;
  no_card?: boolean;
  capabilities?: unknown;
  limit?: unknown;
  created?: number;
  health?: unknown;
  persisted_404?: boolean;
  [key: string]: unknown;
}

/** Parse a single YAML models file (block format) into catalog entries. */
export function parseModelsYamlContent(raw: string): ModelListEntry[] {
  const blocks = raw.split(/\n\s*-\s+id:\s*/);
  const out: ModelListEntry[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const blk = blocks[i];
    const idMatch = blk.match(/^"([^"]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const provider = (blk.match(/provider:\s*([^\n]+)/)?.[1] || id.split("/")[0]).trim();
    const display_name = (blk.match(/display_name:\s*"([^"]+)"/)?.[1] || id).trim();
    const context_length = parseInt(blk.match(/context_length:\s*(\d+)/)?.[1] || "8192", 10);
    const score = parseInt(blk.match(/score:\s*(\d+)/)?.[1] || "50", 10);
    const tier = (blk.match(/tier:\s*([^\n]+)/)?.[1] || "permanent").trim();
    const verified = blk.includes("verified: true");
    const no_card = !blk.includes("no_card: false");
    const capsRaw = blk.match(/capabilities:\s*\[([^\]]+)\]/)?.[1] || "text";
    const capabilities = capsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const limit = (blk.match(/limit:\s*"([^"]+)"/)?.[1] || "").trim();
    out.push({ id, raw_id: id, object: "model", owned_by: provider, provider, display_name, context_length, score, tier, freellms_verified: verified, no_card, capabilities, limit, created: 1715433600 });
  }
  return out;
}

/** Resolve candidate roots where models.yaml / models/ live. */
function modelYamlRoots(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roots: string[] = [
    path.resolve(process.cwd()),
    path.resolve(path.join(here, "../../../../")),
  ];
  try { roots.push(resolveDataPath(".")); } catch { /* ignore */ }
  try { roots.push(resolveDataPath("..")); } catch { /* ignore */ }
  return roots;
}

/** Load models from either split `models/` directory or legacy `models.yaml`. */
export function loadModelsYaml(): ModelListEntry[] {
  try {
    const roots = modelYamlRoots();
    for (const root of roots) {
      const dir = path.join(root, "models");
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
        const merged: ModelListEntry[] = [];
        const seen = new Set<string>();
        for (const f of files) {
          for (const entry of parseModelsYamlContent(fs.readFileSync(path.join(dir, f), "utf-8"))) {
            if (!seen.has(entry.id)) {
              seen.add(entry.id);
              merged.push(entry);
            }
          }
        }
        if (merged.length > 0) return merged;
      }
    }
    for (const root of roots) {
      const p = path.join(root, "models.yaml");
      if (fs.existsSync(p)) {
        const parsed = parseModelsYamlContent(fs.readFileSync(p, "utf-8"));
        if (parsed.length > 0) return parsed;
        const raw = fs.readFileSync(p, "utf-8");
        const ids = [...raw.matchAll(/-\s+id:\s*"([^"]+)"/g)].map((m) => m[1]);
        return ids.map((id) => ({ id, raw_id: id, object: "model", owned_by: id.split("/")[0], provider: id.split("/")[0], display_name: id, context_length: 8192, score: 50, tier: "permanent", freellms_verified: false, no_card: true, capabilities: ["text"], limit: "", created: 1715433600 }));
      }
    }
  } catch { /* ignore */ }
  return [];
}

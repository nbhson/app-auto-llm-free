/**
 * Shared sanitization for freellms model names.
 * Example: "google: gemma 4 31b (free)" -> "google/gemma-4-31b:free"
 * Extracted from models.ts + openai-compatible.ts duplication.
 */
export function sanitizeFreellmsName(name: string): string {
  if (!/[\s()]/.test(name)) return name;
  const hasFree = /\(free\)|:free/i.test(name);
  let s = name.toLowerCase();
  s = s.replace(/\s*:\s*/g, "/").replace(/\s*\/\s*/g, "/");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/[()]/g, "");
  s = s.replace(/--+/g, "-").replace(/\/-+/g, "/").replace(/-\//g, "/");
  if (hasFree && !s.includes(":free")) {
    s = s.replace(/-free$/, ":free");
    if (!s.includes(":free")) s += ":free";
  }
  s = s.replace(/\/free:free$/, ":free").replace(/\/:free$/, ":free");
  return s;
}

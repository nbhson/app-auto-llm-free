/**
 * Minimal HTML -> markdown extraction without heavy deps (jsdom/readability).
 * Keeps gateway dependency-free; uses regex + entity decode.
 * If extraction fails, falls back to stripping tags.
 * For production-grade, can swap to @mozilla/readability + linkedom later without changing callers.
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function htmlToMarkdown(html: string): string {
  let s = stripScripts(html);

  // Extract title
  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";

  // Prefer <article>, <main>, else body
  const articleMatch = s.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = s.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || s;

  // Convert common tags to markdown line breaks
  content = content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) => {
      const hashes = "#".repeat(parseInt(level, 10));
      return `\n${hashes} ${decodeEntities(text.replace(/<[^>]+>/g, "").trim())}\n`;
    })
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const t = decodeEntities(text.replace(/<[^>]+>/g, "").trim());
      const h = href.trim();
      if (!t || !h || h.startsWith("javascript:")) return t;
      return `[${t}](${h})`;
    });

  // Strip remaining tags
  content = content.replace(/<[^>]+>/g, " ");
  content = decodeEntities(content);
  // Normalize whitespace
  content = content
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Remove boilerplate lines (very short or nav-like)
  const lines = content.split("\n").filter((l) => {
    const t = l.trim();
    if (t.length < 20 && /^(menu|navigation|cookie|subscribe|footer|header)$/i.test(t)) return false;
    return t.length > 0;
  });

  let md = lines.join("\n");
  if (title && !md.toLowerCase().includes(title.toLowerCase().slice(0, 30))) {
    md = `# ${title}\n\n${md}`;
  }
  return md;
}

export function extractMarkdown(html: string, url: string, opts: { maxChars?: number } = {}): { markdown: string; title?: string } {
  const maxChars = opts.maxChars ?? 12000;
  const md = htmlToMarkdown(html);
  // Wrap with source header for LLM citation
  const header = `Source: ${url}\n\n`;
  let truncated = md;
  if ((header + md).length > maxChars) {
    const budget = maxChars - header.length - 20;
    const slice = md.slice(0, budget);
    const lastBreak = slice.lastIndexOf("\n\n");
    truncated = lastBreak > budget * 0.6 ? slice.slice(0, lastBreak) + "\n\n[truncated]" : slice + "\n\n[truncated]";
  }
  return { markdown: header + truncated };
}

// For testing: allow direct html->text without URL header
export function extractPlain(html: string): string {
  return htmlToMarkdown(html);
}

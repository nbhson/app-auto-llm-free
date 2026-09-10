import { resJson } from "../lib/types.js";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { audioRoute } from "./v1/audio.js";
import { providers } from "../providers/registry.js";
import { config } from "../config.js";

function wavForm(model = "groq/whisper-large-v3"): FormData {
  const fd = new FormData();
  fd.append("file", new File(["fake-audio-bytes"], "t.wav", { type: "audio/wav" }));
  fd.append("model", model);
  return fd;
}

describe("audio route", () => {
  const origGroq = providers["groq"];

  beforeAll(() => {
    // prefixed model groq/* constrains routing to groq only -> hermetic
    if ((config.providerKeys["groq"] || []).length === 0) {
      config.providerKeys["groq"] = ["test-key-for-groq-0123456789abcdef"];
    }
  });

  afterEach(() => {
    providers["groq"] = origGroq;
  });

  it("transcriptions without file -> 400", async () => {
    const fd = new FormData();
    fd.append("model", "groq/whisper-large-v3");
    const res = await audioRoute.request("/transcriptions", { method: "POST", body: fd });
    expect(res.status).toBe(400);
    const data = await resJson<{ error?: { message?: string; type?: string }; text?: string }>(res);
    expect(data.error?.message).toMatch(/file is required/);
  });

  it("transcriptions with string file -> 400", async () => {
    const fd = new FormData();
    fd.append("file", "not-a-file");
    const res = await audioRoute.request("/transcriptions", { method: "POST", body: fd });
    expect(res.status).toBe(400);
  });

  it("transcriptions success returns {text}", async () => {
    providers["groq"] = {
      ...origGroq,
      transcriptions: async () => new Response(JSON.stringify({ text: "hello world" }), { status: 200 }),
    } as any;
    const res = await audioRoute.request("/transcriptions", { method: "POST", body: wavForm() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ text: "hello world" });
  });

  it("translations reuses transcriptions fallback", async () => {
    const seen: any[] = [];
    providers["groq"] = {
      ...origGroq,
      transcriptions: async (req: any) => {
        seen.push(req);
        return new Response(JSON.stringify({ text: "translated" }), { status: 200 });
      },
    } as any;
    // no `translations` method on mock -> route falls back to transcriptions
    const res = await audioRoute.request("/translations", { method: "POST", body: wavForm() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ text: "translated" });
    expect(seen[0].filename).toBe("t.wav");
  });

  it("transcriptions all-fail -> 502 (no dev mock in test env)", async () => {
    providers["groq"] = {
      ...origGroq,
      transcriptions: async () => new Response("down", { status: 500 }),
    } as any;
    const res = await audioRoute.request("/transcriptions", { method: "POST", body: wavForm() });
    expect(res.status).toBe(502);
  });

  it("speech rejects missing input with 400", async () => {
    const res = await audioRoute.request("/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "groq/tts-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("speech success returns audio/mpeg + X-Provider", async () => {
    providers["groq"] = {
      ...origGroq,
      speech: async () => new Response(Buffer.from("ID3fake-mp3"), { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    } as any;
    const res = await audioRoute.request("/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "groq/tts-1", input: "say hi" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("audio/mpeg");
    expect(res.headers.get("X-Provider")).toBe("groq");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("speech all-fail -> 501 not_supported", async () => {
    providers["groq"] = {
      ...origGroq,
      speech: async () => new Response("down", { status: 500 }),
    } as any;
    const res = await audioRoute.request("/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "groq/tts-1", input: "say hi" }),
    });
    expect(res.status).toBe(501);
    const data = await resJson<{ error?: { message?: string; type?: string }; text?: string }>(res);
    expect(data.error?.type).toBe("not_supported");
  });
});

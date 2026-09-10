import { describe, it, expect, afterEach } from "vitest";
import pino from "pino";
import { REDACTED_PATHS } from "./logger.js";

describe("logger redaction", () => {
  let chunks: string[] = [];
  function makeLogger() {
    chunks = [];
    return pino(
      { redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" } },
      { write: (s: string) => chunks.push(s) } as unknown as NodeJS.WriteStream
    );
  }

  afterEach(() => {
    chunks = [];
  });

  it("Authorization header is replaced with [REDACTED]", () => {
    const log = makeLogger();
    log.info({ req: { headers: { authorization: "Bearer fgk-master-secret" } } }, "request");
    const line = chunks.join("");
    expect(line).toContain("[REDACTED]");
    expect(line).not.toContain("fgk-master-secret");
  });

  it("x-api-key header is replaced with [REDACTED]", () => {
    const log = makeLogger();
    log.info({ req: { headers: { "x-api-key": "fgk-secret" } } }, "request");
    const line = chunks.join("");
    expect(line).toContain("[REDACTED]");
    expect(line).not.toContain("fgk-secret");
  });

  it("nested error config headers are redacted", () => {
    const log = makeLogger();
    log.error({ err: { config: { headers: { Authorization: "Bearer sk-live-123" } }, message: "upstream failed" } }, "error");
    const line = chunks.join("");
    expect(line).not.toContain("sk-live-123");
    expect(line).toContain("[REDACTED]");
    expect(line).toContain("upstream failed");
  });
});

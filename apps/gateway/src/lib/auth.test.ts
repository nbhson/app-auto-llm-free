import { describe, it, expect } from "vitest";
import { timingSafeEqual, extractBearer } from "./auth.js";

describe("auth", () => {
  it("timingSafeEqual works", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("extractBearer parses header", () => {
    const c = { req: { header: (n: string) => (n.toLowerCase() === "authorization" ? "Bearer fgk-test-123" : undefined) } };
    expect(extractBearer(c as never)).toBe("fgk-test-123");
    const c2 = { req: { header: () => undefined } };
    expect(extractBearer(c2 as never)).toBeNull();
  });
});

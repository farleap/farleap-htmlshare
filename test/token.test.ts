import { describe, it, expect } from "vitest";
import { signViewToken, verifyViewToken } from "../src/lib/token";

const S = "test-secret";

describe("view token", () => {
  it("round-trips a valid token", async () => {
    const t = await signViewToken(S, { fileId: "f1", email: "a@farleap.co.jp", exp: 1000 });
    expect(await verifyViewToken(S, t, 999)).toEqual({ fileId: "f1", email: "a@farleap.co.jp" });
  });
  it("rejects expired", async () => {
    const t = await signViewToken(S, { fileId: "f1", email: "a@farleap.co.jp", exp: 1000 });
    expect(await verifyViewToken(S, t, 1001)).toBeNull();
  });
  it("rejects tampered payload", async () => {
    const t = await signViewToken(S, { fileId: "f1", email: "a@farleap.co.jp", exp: 1000 });
    const [, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ fileId: "f2", email: "a@farleap.co.jp", exp: 1000 })) + "." + sig;
    expect(await verifyViewToken(S, forged, 999)).toBeNull();
  });
  it("rejects wrong secret", async () => {
    const t = await signViewToken(S, { fileId: "f1", email: "a@farleap.co.jp", exp: 1000 });
    expect(await verifyViewToken("other", t, 999)).toBeNull();
  });
  it("produces a URL-safe token (no +, /, = that query parsing would mangle)", async () => {
    // Use a payload whose JSON base64 would contain non-url-safe chars under
    // standard base64, to prove the token stays URL-safe end to end.
    const t = await signViewToken(S, { fileId: "ÿ?>~ð/+=", email: "a@farleap.co.jp", exp: 1000 });
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifyViewToken(S, t, 999)).toEqual({ fileId: "ÿ?>~ð/+=", email: "a@farleap.co.jp" });
  });
});

import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("share link", () => {
  it("redirects a valid token to the file", async () => {
    const id = crypto.randomUUID();
    const token = "tok123";
    const { drizzle } = await import("drizzle-orm/d1");
    const { shareLinks } = await import("../src/db/schema");
    await drizzle(env.DB).insert(shareLinks).values({ id: crypto.randomUUID(), fileId: id, token, createdBy: "a@farleap.co.jp", createdAt: 1 });
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/s/${token}`, {
      headers: { host: "docs.local", "X-Test-Email": "a@farleap.co.jp" }, redirect: "manual",
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/f/${id}`);
  });
});

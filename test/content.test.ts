import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { signViewToken } from "../src/lib/token";

async function seed() {
  const id = crypto.randomUUID();
  await env.BUCKET.put(`files/${id}/v1.html`, "<h1>hello</h1>", { httpMetadata: { contentType: "text/html" } });
  const { drizzle } = await import("drizzle-orm/d1");
  const { files } = await import("../src/db/schema");
  await drizzle(env.DB).insert(files).values({
    id, ownerEmail: "a@farleap.co.jp", title: "t", r2Key: `files/${id}/v1.html`,
    sizeBytes: 5, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 9_999_999_999,
  });
  return id;
}

describe("content serving", () => {
  it("serves html with strict headers for a valid token", async () => {
    const id = await seed();
    const exp = Math.floor(Date.now() / 1000) + 120;
    const t = await signViewToken(env.TOKEN_SECRET, { fileId: id, email: "a@farleap.co.jp", exp });
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://content.local/p/${id}?t=${t}`), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a missing token with 403", async () => {
    const id = await seed();
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://content.local/p/${id}`), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);
  });
});

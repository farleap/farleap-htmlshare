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
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors https://docs.local");
    expect(csp).toContain("sandbox allow-scripts allow-popups allow-forms");
    // The opaque-origin containment depends on allow-same-origin NEVER appearing.
    expect(csp).not.toContain("allow-same-origin");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a missing token with 403", async () => {
    const id = await seed();
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://content.local/p/${id}`), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);
  });

  it("rejects a token minted for a different file (cross-file) with 403", async () => {
    const a = await seed();
    const b = await seed();
    const exp = Math.floor(Date.now() / 1000) + 120;
    // token bound to file `a`, used to request file `b`
    const t = await signViewToken(env.TOKEN_SECRET, { fileId: a, email: "a@farleap.co.jp", exp });
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://content.local/p/${b}?t=${t}`), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a soft-deleted file even with a valid token", async () => {
    const id = await seed();
    const { drizzle } = await import("drizzle-orm/d1");
    const { files } = await import("../src/db/schema");
    const { eq } = await import("drizzle-orm");
    await drizzle(env.DB).update(files).set({ deletedAt: 123 }).where(eq(files.id, id));
    const exp = Math.floor(Date.now() / 1000) + 120;
    const t = await signViewToken(env.TOKEN_SECRET, { fileId: id, email: "a@farleap.co.jp", exp });
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://content.local/p/${id}?t=${t}`), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  it("serves a specific version via ?v=<seq>, defaulting to the current blob", async () => {
    const id = crypto.randomUUID();
    const { drizzle } = await import("drizzle-orm/d1");
    const { files, fileVersions } = await import("../src/db/schema");
    const db = drizzle(env.DB);
    await env.BUCKET.put(`files/${id}/v1.html`, "<h1>one</h1>", { httpMetadata: { contentType: "text/html" } });
    await env.BUCKET.put(`files/${id}/v2.html`, "<h1>two</h1>", { httpMetadata: { contentType: "text/html" } });
    await db.insert(files).values({
      id, ownerEmail: "a@farleap.co.jp", title: "t", r2Key: `files/${id}/v2.html`,
      sizeBytes: 5, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 9_999_999_999,
      currentVersionId: `${id}-v2`,
    });
    await db.insert(fileVersions).values([
      { id: `${id}-v1`, fileId: id, seq: 1, r2Key: `files/${id}/v1.html`, authorEmail: "a@farleap.co.jp", createdAt: 1, note: null },
      { id: `${id}-v2`, fileId: id, seq: 2, r2Key: `files/${id}/v2.html`, authorEmail: "a@farleap.co.jp", createdAt: 2, note: null },
    ]);
    const exp = Math.floor(Date.now() / 1000) + 120;
    const t = await signViewToken(env.TOKEN_SECRET, { fileId: id, email: "a@farleap.co.jp", exp });
    const get = async (q: string) => {
      const ctx = createExecutionContext();
      const res = await app.fetch(new Request(`http://content.local/p/${id}?t=${t}${q}`), env, ctx);
      await waitOnExecutionContext(ctx);
      return res;
    };

    expect(await (await get("")).text()).toContain("two"); // default = current (v2)
    const past = await get("&v=1");
    expect(past.status).toBe(200);
    expect(await past.text()).toContain("one"); // older version
    expect((await get("&v=9")).status).toBe(404); // unknown seq
    expect((await get("&v=abc")).status).toBe(404); // non-integer
    expect((await get("&v=0")).status).toBe(404); // out of range
  });
});

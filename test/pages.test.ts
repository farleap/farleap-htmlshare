import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

async function seedFile(owner = "a@farleap.co.jp") {
  const id = crypto.randomUUID();
  const { drizzle } = await import("drizzle-orm/d1");
  const { files } = await import("../src/db/schema");
  await drizzle(env.DB).insert(files).values({
    id, ownerEmail: owner, title: "My Deck", r2Key: `files/${id}/v1.html`,
    sizeBytes: 5, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 9_999_999_999,
  });
  return id;
}

describe("detail page", () => {
  it("embeds a sandboxed iframe without allow-same-origin", async () => {
    const id = await seedFile();
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/f/${id}`, {
      headers: { host: "docs.local", "X-Test-Email": "a@farleap.co.jp" },
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain(`//content.local/p/${id}?t=`);
  });

  it("returns 404 for missing file", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/f/nonexistent-id`, {
      headers: { host: "docs.local", "X-Test-Email": "a@farleap.co.jp" },
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("削除されたか存在しません");
  });

  it("dashboard returns 200 with upload form", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/`, {
      headers: { host: "docs.local", "X-Test-Email": "a@farleap.co.jp" },
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<form");
    expect(html).toContain("Dashboard");
  });
});

import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { files, fileVersions } from "../src/db/schema";

async function seed(owner: string) {
  const id = crypto.randomUUID();
  await env.BUCKET.put(`files/${id}/v1.html`, "<h1>x</h1>");
  await drizzle(env.DB).insert(files).values({
    id, ownerEmail: owner, title: "t", r2Key: `files/${id}/v1.html`,
    sizeBytes: 5, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 100,
  });
  return id;
}
const hdr = (email: string) => ({ host: "docs.local", "X-Test-Email": email });

describe("manage", () => {
  it("owner can delete", async () => {
    const id = await seed("a@farleap.co.jp");
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/api/files/${id}`, { method: "DELETE", headers: hdr("a@farleap.co.jp") }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(204);
    const [row] = await drizzle(env.DB).select().from(files).where(eq(files.id, id));
    expect(row.deletedAt).not.toBeNull();
  });
  it("non-owner cannot delete", async () => {
    const id = await seed("a@farleap.co.jp");
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/api/files/${id}`, { method: "DELETE", headers: hdr("b@farleap.co.jp") }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);
  });
  it("deleting a multi-version file removes every version's blob", async () => {
    const id = await seed("a@farleap.co.jp");
    // Promote the file to v2 so it owns two blobs; delete must reach both.
    await env.BUCKET.put(`files/${id}/v2.html`, "<h1>v2</h1>");
    const db = drizzle(env.DB);
    await db.update(files).set({ r2Key: `files/${id}/v2.html`, currentVersionId: `${id}-v2` }).where(eq(files.id, id));
    await db.insert(fileVersions).values([
      { id: `${id}-v1`, fileId: id, seq: 1, r2Key: `files/${id}/v1.html`, authorEmail: "a@farleap.co.jp", createdAt: 1, note: null },
      { id: `${id}-v2`, fileId: id, seq: 2, r2Key: `files/${id}/v2.html`, authorEmail: "a@farleap.co.jp", createdAt: 2, note: null },
    ]);
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/api/files/${id}`, { method: "DELETE", headers: hdr("a@farleap.co.jp") }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(204);
    expect(await env.BUCKET.get(`files/${id}/v1.html`)).toBeNull();
    expect(await env.BUCKET.get(`files/${id}/v2.html`)).toBeNull();
  });
  it("owner can pin to clear expiry", async () => {
    const id = await seed("a@farleap.co.jp");
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/api/files/${id}/pin`, {
      method: "POST", headers: { ...hdr("a@farleap.co.jp"), "content-type": "application/json" }, body: JSON.stringify({ pinned: true }),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const [row] = await drizzle(env.DB).select().from(files).where(eq(files.id, id));
    expect(row.pinned).toBe(1);
    expect(row.expiresAt).toBeNull();
  });
});

import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { files, fileVersions, comments, shareLinks } from "../src/db/schema";
import { purgeExpired } from "../src/cron";

describe("purgeExpired", () => {
  it("removes expired non-pinned files only, with their share links and R2 objects", async () => {
    const db = drizzle(env.DB);
    const expired = crypto.randomUUID();
    const fresh = crypto.randomUUID();
    const pinned = crypto.randomUUID();
    const alreadyDeleted = crypto.randomUUID();

    await env.BUCKET.put(`files/${expired}/v1.html`, "x");
    await env.BUCKET.put(`files/${fresh}/v1.html`, "x");
    await env.BUCKET.put(`files/${pinned}/v1.html`, "x");

    await db.insert(files).values([
      { id: expired, ownerEmail: "a@farleap.co.jp", title: "e", r2Key: `files/${expired}/v1.html`, sizeBytes: 1, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 50 },
      { id: fresh, ownerEmail: "a@farleap.co.jp", title: "f", r2Key: `files/${fresh}/v1.html`, sizeBytes: 1, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 9_999_999_999 },
      { id: pinned, ownerEmail: "a@farleap.co.jp", title: "p", r2Key: `files/${pinned}/v1.html`, sizeBytes: 1, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: null, pinned: 1 },
      // expired in absolute time but already tombstoned: cron must not double-count it.
      { id: alreadyDeleted, ownerEmail: "a@farleap.co.jp", title: "d", r2Key: `files/${alreadyDeleted}/v1.html`, sizeBytes: 1, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 50, deletedAt: 60 },
    ]);

    // The expired file owns a share link that must be removed along with it.
    await db.insert(shareLinks).values({ id: crypto.randomUUID(), fileId: expired, token: "tok-expired", createdBy: "a@farleap.co.jp", createdAt: 1 });

    const r = await purgeExpired(env, 100);
    expect(r.deleted).toBe(1);

    expect((await db.select().from(files).where(eq(files.id, expired))).length).toBe(0);
    expect((await db.select().from(files).where(eq(files.id, fresh))).length).toBe(1);
    expect((await db.select().from(files).where(eq(files.id, pinned))).length).toBe(1);
    expect((await db.select().from(shareLinks).where(eq(shareLinks.fileId, expired))).length).toBe(0);
    expect(await env.BUCKET.get(`files/${expired}/v1.html`)).toBeNull();
    expect(await env.BUCKET.get(`files/${fresh}/v1.html`)).not.toBeNull();
  });

  it("cascades a multi-version file: all version blobs, comments and version rows go", async () => {
    const db = drizzle(env.DB);
    const id = crypto.randomUUID();
    await env.BUCKET.put(`files/${id}/v1.html`, "v1");
    await env.BUCKET.put(`files/${id}/v2.html`, "v2");

    // File points at v2 (the current version); both versions exist.
    await db.insert(files).values({
      id, ownerEmail: "a@farleap.co.jp", title: "t", r2Key: `files/${id}/v2.html`,
      sizeBytes: 2, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 50,
      currentVersionId: `${id}-v2`,
    });
    await db.insert(fileVersions).values([
      { id: `${id}-v1`, fileId: id, seq: 1, r2Key: `files/${id}/v1.html`, authorEmail: "a@farleap.co.jp", createdAt: 1, note: null },
      { id: `${id}-v2`, fileId: id, seq: 2, r2Key: `files/${id}/v2.html`, authorEmail: "a@farleap.co.jp", createdAt: 2, note: null },
    ]);
    await db.insert(comments).values({
      id: crypto.randomUUID(), fileId: id, versionId: `${id}-v2`, authorEmail: "r@farleap.co.jp",
      body: "x", createdAt: 1, status: "active", resolved: 0,
    });

    const r = await purgeExpired(env, 100);
    expect(r.deleted).toBe(1);

    expect(await env.BUCKET.get(`files/${id}/v1.html`)).toBeNull();
    expect(await env.BUCKET.get(`files/${id}/v2.html`)).toBeNull();
    expect((await db.select().from(fileVersions).where(eq(fileVersions.fileId, id))).length).toBe(0);
    expect((await db.select().from(comments).where(eq(comments.fileId, id))).length).toBe(0);
    expect((await db.select().from(files).where(eq(files.id, id))).length).toBe(0);
  });
});

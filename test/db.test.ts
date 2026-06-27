import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { files } from "../src/db/schema";

describe("files table", () => {
  it("inserts and reads a row", async () => {
    const db = drizzle(env.DB);
    await db.insert(files).values({
      id: "f1", ownerEmail: "a@farleap.co.jp", title: "t", r2Key: "files/f1/v1.html",
      sizeBytes: 10, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 100,
    });
    const rows = await db.select().from(files);
    expect(rows.length).toBe(1);
    expect(rows[0].orgVisibility).toBe("org_view");
  });
});

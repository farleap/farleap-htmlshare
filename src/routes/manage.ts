import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../index";
import { files } from "../db/schema";

export const manage = new Hono<{ Bindings: Env }>();

async function owned(c: any, id: string) {
  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!row) return { db, row: null as any, ok: false };
  return { db, row, ok: row.ownerEmail === c.get("userEmail") };
}

manage.delete("/api/files/:id", async (c) => {
  const { db, row, ok } = await owned(c, c.req.param("id"));
  if (!row) return c.json({ error: "not found" }, 404);
  if (!ok) return c.json({ error: "forbidden" }, 403);
  // Tombstone first: if the R2 delete fails afterwards the file is already
  // hidden (no live row points at the object), never the reverse.
  await db.update(files).set({ deletedAt: Math.floor(Date.now() / 1000) }).where(eq(files.id, row.id));
  await c.env.BUCKET.delete(row.r2Key);
  return c.body(null, 204);
});

manage.post("/api/files/:id/pin", async (c) => {
  const { db, row, ok } = await owned(c, c.req.param("id"));
  if (!row) return c.json({ error: "not found" }, 404);
  if (!ok) return c.json({ error: "forbidden" }, 403);
  const { pinned } = await c.req.json<{ pinned: boolean }>();
  const expiresAt = pinned ? null : row.createdAt + 90 * 24 * 3600;
  await db.update(files).set({ pinned: pinned ? 1 : 0, expiresAt }).where(eq(files.id, row.id));
  return c.json({ ok: true });
});

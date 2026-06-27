import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../index";
import { files } from "../db/schema";
import { verifyViewToken } from "../lib/token";

export const content = new Hono<{ Bindings: Env }>();

content.get("/p/:fileId", async (c) => {
  const fileId = c.req.param("fileId");
  const token = c.req.query("t");
  if (!token) return c.text("forbidden", 403);
  const now = Math.floor(Date.now() / 1000);
  const v = await verifyViewToken(c.env.TOKEN_SECRET, token, now);
  if (!v || v.fileId !== fileId) return c.text("forbidden", 403);

  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!row || row.deletedAt) return c.text("not found", 404);

  const obj = await c.env.BUCKET.get(row.r2Key);
  if (!obj) return c.text("not found", 404);

  // frame-ancestors must match the scheme the App is actually served on, or the
  // browser blocks the embed. Prod is HTTPS (default); local dev is HTTP and sets
  // APP_SCHEME=http in .dev.vars. Mismatched scheme silently empties the iframe.
  const appScheme = c.env.APP_SCHEME ?? "https";

  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "content-security-policy": `frame-ancestors ${appScheme}://${c.env.APP_HOST}; sandbox allow-scripts allow-popups allow-forms;`,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
});

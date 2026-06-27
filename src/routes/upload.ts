import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";
import { files, shareLinks } from "../db/schema";
import { extractTitle, looksLikeHtml } from "../lib/html";

const MAX = 25 * 1024 * 1024;

export const upload = new Hono<{ Bindings: Env }>();

upload.post("/api/files", async (c) => {
  const owner = c.get("userEmail");
  const fd = await c.req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return c.json({ error: "no file" }, 400);
  if (file.size > MAX) return c.json({ error: "too large" }, 413);

  const buf = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeHtml(buf)) return c.json({ error: "not html" }, 415);

  const html = new TextDecoder().decode(buf);
  const id = crypto.randomUUID();
  const r2Key = `files/${id}/v1.html`;
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 90 * 24 * 3600;

  await c.env.BUCKET.put(r2Key, buf, { httpMetadata: { contentType: "text/html; charset=utf-8" } });

  const db = drizzle(c.env.DB);
  await db.insert(files).values({
    id, ownerEmail: owner, title: extractTitle(html, file.name),
    r2Key, sizeBytes: file.size, contentHash: hash,
    createdAt: now, updatedAt: now, expiresAt,
  });
  const token = crypto.randomUUID().replace(/-/g, "");
  await db.insert(shareLinks).values({ id: crypto.randomUUID(), fileId: id, token, createdBy: owner, createdAt: now });

  return c.json({ id, viewUrl: `/f/${id}`, shareUrl: `/s/${token}` }, 201);
});

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, ne, desc } from "drizzle-orm";
import type { Env } from "../index";
import { files, fileVersions, comments } from "../db/schema";
import { looksLikeHtml } from "../lib/html";
import { reanchor } from "../lib/reanchor";

const MAX = 25 * 1024 * 1024;
const NOTE_MAX = 500;
const RETENTION_SEC = 90 * 24 * 3600;

export const versions = new Hono<{ Bindings: Env }>();

// Upload a NEW version of an existing file (Phase 3 — Iterate). Same file id,
// share links, title and pin are inherited (file-scoped); only the content
// changes: a new `fileVersions` row + a fresh R2 blob, and the file pointer
// (currentVersionId / r2Key) advances to it. Owner-only, like delete/pin.
//
// On a new version, unresolved comments are re-anchored against the new HTML
// (ADR-0005): a unique prefix+exact+suffix match follows to the new version,
// anything else is parked as `orphaned` (the old quote is preserved). resolved
// comments are never touched. Non-inline (no-anchor) comments just carry over.
versions.post("/api/files/:id/versions", async (c) => {
  const me = c.get("userEmail");
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!row || row.deletedAt) return c.json({ error: "not found" }, 404);
  if (row.ownerEmail !== me) return c.json({ error: "forbidden" }, 403);

  const fd = await c.req.formData();
  // FormData.get() is File | string | null; `unknown` lets instanceof narrow.
  const file: unknown = fd.get("file");
  if (!(file instanceof File)) return c.json({ error: "no file" }, 400);
  if (file.size > MAX) return c.json({ error: "too large" }, 413);

  const buf = new Uint8Array(await file.arrayBuffer());
  // `file.size` is client-reported; enforce the real byte count too.
  if (buf.byteLength > MAX) return c.json({ error: "too large" }, 413);
  if (!looksLikeHtml(buf)) return c.json({ error: "not html" }, 415);

  const noteRaw = fd.get("note");
  const note = typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, NOTE_MAX) : null;

  const html = new TextDecoder().decode(buf);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);

  // Next seq = current max + 1. The file_versions(file_id, seq) index keeps this
  // lookup cheap; the version id stays deterministic (<file id>-v<seq>), matching
  // the v1 convention from upload.ts / the backfill.
  const [latest] = await db
    .select({ seq: fileVersions.seq })
    .from(fileVersions)
    .where(eq(fileVersions.fileId, id))
    .orderBy(desc(fileVersions.seq))
    .limit(1);
  const seq = (latest?.seq ?? 0) + 1;
  const versionId = `${id}-v${seq}`;
  const r2Key = `files/${id}/v${seq}.html`;

  await c.env.BUCKET.put(r2Key, buf, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  await db.insert(fileVersions).values({
    id: versionId, fileId: id, seq, r2Key, authorEmail: me, createdAt: now, note,
  });

  // Advance the file pointer to the new version. Title / share links / pin are
  // inherited (not rebuilt per version). Retention restarts from the latest
  // version, except pinned files which stay exempt (expiresAt = null).
  await db
    .update(files)
    .set({
      r2Key,
      sizeBytes: buf.byteLength,
      contentHash: hash,
      currentVersionId: versionId,
      updatedAt: now,
      expiresAt: row.pinned ? null : now + RETENTION_SEC,
    })
    .where(eq(files.id, id));

  // Re-anchor unresolved (active | orphaned) comments onto the new version.
  const open = await db
    .select()
    .from(comments)
    .where(and(eq(comments.fileId, id), ne(comments.status, "resolved")));
  let followed = 0;
  let orphaned = 0;
  for (const cm of open) {
    // No-anchor (document-level) comments aren't pinned to text; leave them be.
    if (!cm.anchorExact) continue;
    const r = reanchor(html, { exact: cm.anchorExact, prefix: cm.anchorPrefix, suffix: cm.anchorSuffix });
    if (r.kind === "follow") {
      await db
        .update(comments)
        .set({ versionId, status: "active", anchorStart: r.start, anchorEnd: r.end })
        .where(eq(comments.id, cm.id));
      followed++;
    } else {
      // Park it: keep the original quote/context and prior versionId so the UI
      // can show "this section changed" with the old excerpt. Only flip status.
      if (cm.status !== "orphaned") {
        await db.update(comments).set({ status: "orphaned" }).where(eq(comments.id, cm.id));
      }
      orphaned++;
    }
  }

  return c.json({ id: versionId, seq, viewUrl: `/f/${id}`, reanchored: { followed, orphaned } }, 201);
});

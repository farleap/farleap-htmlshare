import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, isNull, asc } from "drizzle-orm";
import type { Env } from "../index";
import { files, comments } from "../db/schema";

// Comment API (App plane, mounted under /api/* so authGuard has set userEmail).
// Per ADR-0006: never reuse the Content view token; authorize via the App
// identity + a fresh DB lookup of the file. Anchors arrive from the iframe via
// the App and are treated as untrusted input (sizes re-validated here).
export const commentsRoute = new Hono<{ Bindings: Env }>();

const BODY_MAX = 4000;
const ANCHOR_EXACT_MAX = 2000;
const ANCHOR_CTX_MAX = 200;

// A live (non-deleted) file. V2: anyone authenticated may read/comment
// (org viewers = commenters; per-file permissions are Phase 4).
async function liveFile(c: any, id: string) {
  const db = drizzle(c.env.DB);
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), isNull(files.deletedAt)))
    .limit(1);
  return { db, file: file ?? null };
}

commentsRoute.get("/api/files/:id/comments", async (c) => {
  const { db, file } = await liveFile(c, c.req.param("id"));
  if (!file) return c.json({ error: "not found" }, 404);
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.fileId, file.id))
    .orderBy(asc(comments.createdAt));
  return c.json({ comments: rows });
});

commentsRoute.post("/api/files/:id/comments", async (c) => {
  const me = c.get("userEmail");
  const { db, file } = await liveFile(c, c.req.param("id"));
  if (!file) return c.json({ error: "not found" }, 404);

  const input = await c.req
    .json<{
      body?: string;
      versionId?: string;
      parentId?: string;
      anchor?: { exact?: string; prefix?: string; suffix?: string; start?: number; end?: number };
    }>()
    .catch(() => null);
  if (!input) return c.json({ error: "invalid json" }, 400);

  const body = (input.body ?? "").trim();
  if (!body) return c.json({ error: "empty body" }, 400);
  if (body.length > BODY_MAX) return c.json({ error: "body too long" }, 413);

  const a = input.anchor;
  if (a) {
    if ((a.exact?.length ?? 0) > ANCHOR_EXACT_MAX) return c.json({ error: "anchor too long" }, 413);
    if ((a.prefix?.length ?? 0) > ANCHOR_CTX_MAX || (a.suffix?.length ?? 0) > ANCHOR_CTX_MAX)
      return c.json({ error: "anchor context too long" }, 413);
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  await db.insert(comments).values({
    id,
    fileId: file.id,
    versionId: input.versionId ?? file.currentVersionId ?? null,
    authorEmail: me,
    body,
    createdAt: now,
    status: "active",
    resolved: 0,
    parentId: input.parentId ?? null,
    anchorExact: a?.exact ?? null,
    anchorPrefix: a?.prefix ?? null,
    anchorSuffix: a?.suffix ?? null,
    anchorStart: a?.start ?? null,
    anchorEnd: a?.end ?? null,
  });
  return c.json({ id }, 201);
});

commentsRoute.patch("/api/comments/:commentId", async (c) => {
  const me = c.get("userEmail");
  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(comments).where(eq(comments.id, c.req.param("commentId"))).limit(1);
  if (!row) return c.json({ error: "not found" }, 404);

  const input = await c.req.json<{ body?: string; resolved?: boolean }>().catch(() => null);
  if (!input) return c.json({ error: "invalid json" }, 400);

  const patch: Record<string, unknown> = {};
  if (typeof input.body === "string") {
    if (row.authorEmail !== me) return c.json({ error: "forbidden" }, 403);
    const b = input.body.trim();
    if (!b) return c.json({ error: "empty body" }, 400);
    if (b.length > BODY_MAX) return c.json({ error: "body too long" }, 413);
    patch.body = b;
  }
  if (typeof input.resolved === "boolean") {
    const [file] = await db.select().from(files).where(eq(files.id, row.fileId)).limit(1);
    const isOwner = file?.ownerEmail === me;
    if (row.authorEmail !== me && !isOwner) return c.json({ error: "forbidden" }, 403);
    patch.resolved = input.resolved ? 1 : 0;
    patch.status = input.resolved ? "resolved" : "active";
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "nothing to update" }, 400);
  await db.update(comments).set(patch).where(eq(comments.id, row.id));
  return c.json({ ok: true });
});

commentsRoute.delete("/api/comments/:commentId", async (c) => {
  const me = c.get("userEmail");
  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(comments).where(eq(comments.id, c.req.param("commentId"))).limit(1);
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.authorEmail !== me) return c.json({ error: "forbidden" }, 403);
  await db.delete(comments).where(eq(comments.id, row.id));
  return c.body(null, 204);
});

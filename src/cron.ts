import { drizzle } from "drizzle-orm/d1";
import { and, lt, eq, isNull, isNotNull } from "drizzle-orm";
import type { Env } from "./index";
import { files, fileVersions, comments, shareLinks } from "./db/schema";

// Hard-delete files whose 90-day window has elapsed: expired, not pinned, not
// already tombstoned. The delete is a file-scoped cascade (ADR-0005 / DESIGN
// §6.3): every version's R2 blob, then comments, version rows, share links, and
// the file row — no orphaned blobs or rows left behind. Retention keys off
// files.expiresAt, which a new-version upload resets to the latest version, so
// the window already tracks the most recent version.
export async function purgeExpired(env: Env, nowSec: number): Promise<{ deleted: number }> {
  const db = drizzle(env.DB);
  const due = await db
    .select()
    .from(files)
    .where(
      and(
        isNotNull(files.expiresAt),
        lt(files.expiresAt, nowSec),
        eq(files.pinned, 0),
        isNull(files.deletedAt),
      ),
    );
  for (const f of due) {
    const vs = await db
      .select({ r2Key: fileVersions.r2Key })
      .from(fileVersions)
      .where(eq(fileVersions.fileId, f.id));
    // Union with f.r2Key so a current pointer with no version row (legacy data)
    // is still removed; deleting an absent key is a no-op.
    for (const key of new Set([f.r2Key, ...vs.map((v) => v.r2Key)])) {
      await env.BUCKET.delete(key);
    }
    await db.delete(comments).where(eq(comments.fileId, f.id));
    await db.delete(fileVersions).where(eq(fileVersions.fileId, f.id));
    await db.delete(shareLinks).where(eq(shareLinks.fileId, f.id));
    await db.delete(files).where(eq(files.id, f.id));
  }
  return { deleted: due.length };
}

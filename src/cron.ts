import { drizzle } from "drizzle-orm/d1";
import { and, lt, eq, isNull, isNotNull } from "drizzle-orm";
import type { Env } from "./index";
import { files, shareLinks } from "./db/schema";

// Hard-delete files whose 90-day window has elapsed: expired, not pinned, not
// already tombstoned. Removes the R2 object, the file's share links, and the row.
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
    await env.BUCKET.delete(f.r2Key);
    await db.delete(shareLinks).where(eq(shareLinks.fileId, f.id));
    await db.delete(files).where(eq(files.id, f.id));
  }
  return { deleted: due.length };
}

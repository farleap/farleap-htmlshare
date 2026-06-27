/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, isNull, and } from "drizzle-orm";
import type { Env } from "../index";
import { files } from "../db/schema";
import { signViewToken } from "../lib/token";
import { Layout } from "../views/layout";

export const pages = new Hono<{ Bindings: Env }>();

pages.get("/", async (c) => {
  const me = c.get("userEmail");
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(files)
    .where(isNull(files.deletedAt))
    .orderBy(desc(files.createdAt))
    .limit(100);
  return c.html(
    <Layout title="Dashboard">
      <form method="post" action="/api/files" enctype="multipart/form-data">
        <input type="file" name="file" accept=".html,text/html" required />
        <button type="submit">Upload</button>
      </form>
      <p>Signed in as {me}</p>
      {rows.map((r) => (
        <div class="card">
          <a href={`/f/${r.id}`}>{r.title}</a> — {r.ownerEmail}
        </div>
      ))}
    </Layout>,
  );
});

pages.get("/f/:fileId", async (c) => {
  const id = c.req.param("fileId");
  const me = c.get("userEmail");
  const db = drizzle(c.env.DB);
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), isNull(files.deletedAt)))
    .limit(1);
  if (!row) {
    return c.html(
      <Layout title="Not found">
        <p>この資料は削除されたか存在しません。</p>
      </Layout>,
      404,
    );
  }
  const exp = Math.floor(Date.now() / 1000) + 120;
  const token = await signViewToken(c.env.TOKEN_SECRET, { fileId: id, email: me, exp });
  const src = `//${c.env.CONTENT_HOST}/p/${id}?t=${token}`;
  return c.html(
    <Layout title={row.title}>
      <h1>{row.title}</h1>
      <iframe sandbox="allow-scripts allow-popups allow-forms" src={src}></iframe>
    </Layout>,
  );
});

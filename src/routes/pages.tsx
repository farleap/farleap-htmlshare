/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, isNull, and } from "drizzle-orm";
import { raw } from "hono/html";
import type { Env } from "../index";
import { files, shareLinks } from "../db/schema";
import { signViewToken } from "../lib/token";
import { Layout } from "../views/layout";

// Progressive enhancement: upload via fetch and jump to the file on success.
// The plain <form> POST still works without JS (returns JSON). The /api/files
// contract is unchanged, so this never affects the API or its tests.
const UPLOAD_SCRIPT = `
<script>
(function () {
  var f = document.getElementById('up');
  if (!f) return;
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = f.querySelector('button'), msg = document.getElementById('upmsg');
    btn.disabled = true; btn.textContent = 'Uploading…'; msg.textContent = '';
    try {
      var r = await fetch('/api/files', { method: 'POST', body: new FormData(f) });
      var j = await r.json();
      if (r.ok) { location.href = j.viewUrl; return; }
      msg.textContent = 'Upload failed: ' + (j.error || r.status);
    } catch (err) { msg.textContent = 'Upload error'; }
    btn.disabled = false; btn.textContent = 'Upload';
  });
})();
</script>`;

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
      <form id="up" method="post" action="/api/files" enctype="multipart/form-data">
        <input type="file" name="file" accept=".html,text/html" required />
        <button type="submit">Upload</button>
      </form>
      <p id="upmsg" style="color:#b91c1c"></p>
      <p>Signed in as {me}</p>
      {rows.length === 0 ? <p>まだ資料がありません。HTML をアップロードしてください。</p> : null}
      {rows.map((r) => (
        <div class="card">
          <a href={`/f/${r.id}`}>{r.title}</a> — {r.ownerEmail}
        </div>
      ))}
      {raw(UPLOAD_SCRIPT)}
    </Layout>,
  );
});

pages.get("/s/:token", async (c) => {
  const token = c.req.param("token");
  const db = drizzle(c.env.DB);
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  if (!link || link.revoked) return c.html(<Layout title="Not found"><p>リンクが無効です。</p></Layout>, 404);
  return c.redirect(`/f/${link.fileId}`, 302);
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

/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, isNull, and } from "drizzle-orm";
import { raw } from "hono/html";
import type { Env } from "../index";
import { files, shareLinks } from "../db/schema";
import { signViewToken } from "../lib/token";
import { Layout } from "../views/layout";

export const pages = new Hono<{ Bindings: Env }>();

// Lucide-style inline SVG icons (no emoji icons, per design guidelines).
const svg = (inner: string) =>
  raw(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`,
  );
const ICON = {
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  user: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  back: svg('<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5"/><path d="M14 11a5 5 0 0 0-7.07 0l-1.41 1.41a5 5 0 0 0 7.07 7.07L13 19"/>'),
};

function expiryLabel(row: { pinned: number; expiresAt: number | null }, nowSec: number): string {
  if (row.pinned) return "保存期限なし";
  if (!row.expiresAt) return "";
  const days = Math.ceil((row.expiresAt - nowSec) / 86400);
  return days <= 0 ? "まもなく削除" : `残り ${days} 日`;
}

pages.get("/", async (c) => {
  const me = c.get("userEmail");
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(files)
    .where(isNull(files.deletedAt))
    .orderBy(desc(files.createdAt))
    .limit(100);
  const now = Math.floor(Date.now() / 1000);
  return c.html(
    <Layout title="Dashboard" user={me}>
      <div class="page-head">
        <div>
          <div class="label">Shared documents</div>
          <h1 class="title">共有資料</h1>
        </div>
        <div class="count">{rows.length} 件</div>
      </div>

      <form id="up" class="drop" method="post" action="/api/files" enctype="multipart/form-data">
        <span class="ic">{ICON.upload}</span>
        <div class="txt">
          <b>HTML 資料をアップロード</b>
          <small>自己完結の .html を1ファイル（最大25MB）。社内の誰でも開ける共有リンクを発行します。</small>
        </div>
        <div class="drop-actions">
          <input id="file" type="file" name="file" accept=".html,text/html" aria-label="HTMLファイルを選択" required />
          <button class="btn" type="submit">
            {ICON.upload}
            アップロード
          </button>
        </div>
      </form>
      <p id="upmsg" class="msg"></p>

      <div class="grid">
        {rows.length === 0 ? (
          <div class="empty">
            {ICON.doc}
            <p>まだ資料がありません。上の枠から HTML をアップロードしてください。</p>
          </div>
        ) : null}
        {rows.map((r) => (
          <div class="fcard">
            <div class="row">
              <span class="doc">{ICON.doc}</span>
              <span class="tag">HTML</span>
            </div>
            <h3>
              <a href={`/f/${r.id}`}>{r.title}</a>
            </h3>
            <div class="meta">
              <span class="m">{ICON.user} {r.ownerEmail}</span>
              {expiryLabel(r, now) ? <span class="m">{ICON.clock} {expiryLabel(r, now)}</span> : null}
            </div>
          </div>
        ))}
      </div>
      {raw(UPLOAD_SCRIPT)}
    </Layout>,
  );
});

pages.get("/s/:token", async (c) => {
  const token = c.req.param("token");
  const db = drizzle(c.env.DB);
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  if (!link || link.revoked) {
    return c.html(
      <Layout title="Not found" user={c.get("userEmail")}>
        <a class="back" href="/">{ICON.back} 一覧へ</a>
        <div class="notice">リンクが無効か、取り消されています。</div>
      </Layout>,
      404,
    );
  }
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
      <Layout title="Not found" user={me}>
        <a class="back" href="/">{ICON.back} 一覧へ</a>
        <div class="notice">この資料は削除されたか存在しません。</div>
      </Layout>,
      404,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 120;
  const token = await signViewToken(c.env.TOKEN_SECRET, { fileId: id, email: me, exp });
  const src = `//${c.env.CONTENT_HOST}/p/${id}?t=${token}`;

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.fileId, id), eq(shareLinks.revoked, 0)))
    .limit(1);

  return c.html(
    <Layout title={row.title} user={me}>
      <a class="back" href="/">{ICON.back} 一覧へ</a>
      <div class="detail-head">
        <div>
          <div class="label">Preview</div>
          <h1>{row.title}</h1>
          <div class="meta">
            <span class="m">{ICON.user} {row.ownerEmail}</span>
            {expiryLabel(row, now) ? <span class="m">{ICON.clock} {expiryLabel(row, now)}</span> : null}
          </div>
        </div>
        {link ? (
          <button id="copy" class="btn btn-ghost" type="button" data-url={`/s/${link.token}`}>
            {ICON.link}
            <span>共有リンクをコピー</span>
          </button>
        ) : null}
      </div>

      <div class="frame">
        <div class="bar">
          <span class="dots"><i></i><i></i><i></i></span>
          <span class="u">{row.title}</span>
        </div>
        <iframe sandbox="allow-scripts allow-popups allow-forms" src={src} title={`Preview: ${row.title}`}></iframe>
      </div>
      {raw(COPY_SCRIPT)}
    </Layout>,
  );
});

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
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'アップロード中…'; msg.textContent = '';
    try {
      var r = await fetch('/api/files', { method: 'POST', body: new FormData(f) });
      var j = await r.json();
      if (r.ok) { location.href = j.viewUrl; return; }
      msg.textContent = 'アップロードに失敗しました: ' + (j.error || r.status);
    } catch (err) { msg.textContent = 'アップロードエラーが発生しました'; }
    btn.disabled = false; btn.textContent = label;
  });
})();
</script>`;

const COPY_SCRIPT = `
<script>
(function () {
  var b = document.getElementById('copy');
  if (!b) return;
  b.addEventListener('click', function () {
    var url = location.origin + b.dataset.url;
    navigator.clipboard.writeText(url).then(function () {
      var t = b.querySelector('span'), o = t.textContent;
      t.textContent = 'コピーしました';
      setTimeout(function () { t.textContent = o; }, 1600);
    });
  });
})();
</script>`;

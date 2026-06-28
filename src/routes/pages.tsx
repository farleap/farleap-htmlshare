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
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
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
        <div class="count" id="count">{rows.length} 件</div>
      </div>

      <form id="up" class="drop" method="post" action="/api/files" enctype="multipart/form-data">
        <input id="file" class="sr-only" type="file" name="file" accept=".html,text/html" aria-label="HTMLファイルを選択" />
        <span class="ic">{ICON.upload}</span>
        <div class="txt">
          <b>HTML 資料をドラッグ＆ドロップ</b>
          <small>またはクリックして選択。自己完結の .html を1ファイル（最大25MB）。社内の誰でも開ける共有リンクを発行します。</small>
        </div>
        <button id="pick" class="btn" type="button">
          {ICON.upload}
          アップロード
        </button>
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
              <div class="top-actions">
                <span class="tag">HTML</span>
                {r.ownerEmail === me ? (
                  <button class="iconbtn del" type="button" data-id={r.id} aria-label={`「${r.title}」を削除`} title="削除">
                    {ICON.trash}
                  </button>
                ) : null}
              </div>
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
      {raw(DELETE_SCRIPT)}
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
    <Layout title={row.title} user={me} wide>
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
        <div class="top-actions">
          <button id="review" class="btn btn-ghost" type="button" aria-pressed="false">
            レビュー <span id="rcount" class="count"></span>
          </button>
          {link ? (
            <button id="copy" class="btn btn-ghost" type="button" data-url={`/s/${link.token}`}>
              {ICON.link}
              <span>共有リンクをコピー</span>
            </button>
          ) : null}
        </div>
      </div>

      <div id="rwrap" class="frame">
        <div class="bar">
          <span class="dots"><i></i><i></i><i></i></span>
          <span class="u">{row.title}</span>
        </div>
        <iframe id="pv" sandbox="allow-scripts allow-popups allow-forms" src={src} data-rsrc={`${src}&review=1`} title={`Preview: ${row.title}`}></iframe>
        <aside id="cpanel" hidden>
          <div class="cphead">コメント <span id="copen"></span></div>
          <div id="clist"></div>
          <div id="ccompose">
            <div id="csel" class="csel"></div>
            <textarea id="cbody" rows={3} placeholder="コメントを入力（プレビューで範囲を選ぶと位置に固定）"></textarea>
            <button id="csend" class="btn" type="button">コメント</button>
            <p id="cmsg" class="msg"></p>
          </div>
        </aside>
      </div>
      {raw(COPY_SCRIPT)}
      {raw(REVIEW_SCRIPT)}
    </Layout>,
  );
});

// Upload UX: click the zone / button to pick, or drag & drop a file. No native
// "Choose File" control is shown. On pick or drop the file uploads immediately
// (fetch) and jumps to the file. The /api/files contract is unchanged.
const UPLOAD_SCRIPT = `
<script>
(function () {
  var zone = document.getElementById('up');
  if (!zone) return;
  var input = document.getElementById('file');
  var pick = document.getElementById('pick');
  var msg = document.getElementById('upmsg');
  var label = pick.textContent;
  var busy = false;

  function setBusy(b) {
    busy = b; pick.disabled = b; pick.textContent = b ? 'アップロード中…' : label;
  }
  function open() { if (!busy) input.click(); }

  async function upload(file) {
    if (busy || !file) return;
    var ok = file.type === 'text/html' || /\\.html?$/i.test(file.name);
    if (!ok) { msg.textContent = 'HTML ファイル (.html) を選択してください'; return; }
    var fd = new FormData(); fd.append('file', file);
    setBusy(true); msg.textContent = '';
    try {
      var r = await fetch('/api/files', { method: 'POST', body: fd });
      var j = await r.json();
      if (r.ok) { location.href = j.viewUrl; return; }
      msg.textContent = 'アップロードに失敗しました: ' + (j.error || r.status);
    } catch (err) { msg.textContent = 'アップロードエラーが発生しました'; }
    setBusy(false);
  }

  zone.addEventListener('click', open);
  pick.addEventListener('click', function (e) { e.stopPropagation(); open(); });
  input.addEventListener('change', function () { upload(input.files[0]); });

  ['dragenter', 'dragover'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-drag'); });
  });
  ['dragleave', 'dragend'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) {
      if (ev === 'dragleave' && zone.contains(e.relatedTarget)) return;
      zone.classList.remove('is-drag');
    });
  });
  zone.addEventListener('drop', function (e) {
    e.preventDefault(); zone.classList.remove('is-drag');
    upload(e.dataTransfer && e.dataTransfer.files[0]);
  });
  // Prevent a misdrop elsewhere from navigating away.
  ['dragover', 'drop'].forEach(function (ev) {
    window.addEventListener(ev, function (e) { if (e.target !== zone && !zone.contains(e.target)) e.preventDefault(); });
  });
})();
</script>`;

// Owner-only delete (DELETE /api/files/:id → 204). Removes the card in place and
// updates the count; reloads to show the empty state when the last one is removed.
const DELETE_SCRIPT = `
<script>
(function () {
  var msg = document.getElementById('upmsg');
  document.querySelectorAll('.del').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.preventDefault(); e.stopPropagation();
      var card = btn.closest('.fcard');
      var title = (card.querySelector('h3') || {}).textContent || 'この資料';
      if (!confirm('「' + title.trim() + '」を削除しますか？この操作は取り消せません。')) return;
      btn.disabled = true; if (msg) msg.textContent = '';
      try {
        var r = await fetch('/api/files/' + btn.dataset.id, { method: 'DELETE' });
        if (r.status === 204) {
          card.remove();
          var n = document.querySelectorAll('.fcard').length;
          var c = document.getElementById('count'); if (c) c.textContent = n + ' 件';
          if (n === 0) location.reload();
          return;
        }
        if (msg) msg.textContent = '削除に失敗しました (' + r.status + ')';
        btn.disabled = false;
      } catch (err) { if (msg) msg.textContent = '削除エラーが発生しました'; btn.disabled = false; }
    });
  });
})();
</script>`;

// Review mode (App side). Per ADR-0006: messages from the iframe are UNTRUSTED
// hints; the selection only pre-fills the composer. Comments are created via the
// authenticated API. All comment-derived strings are rendered with textContent
// (never innerHTML) so adversarial HTML cannot become stored XSS on the App.
const REVIEW_SCRIPT = `
<script>
(function () {
  var btn = document.getElementById('review');
  if (!btn) return;
  var pv = document.getElementById('pv'), panel = document.getElementById('cpanel');
  var list = document.getElementById('clist'), sel = document.getElementById('csel');
  var bodyEl = document.getElementById('cbody'), send = document.getElementById('csend');
  var msg = document.getElementById('cmsg'), openCount = document.getElementById('copen');
  var rcount = document.getElementById('rcount');
  var fid = location.pathname.split('/').pop();
  var on = false, pending = null, port = null;

  async function load() {
    try {
      var r = await fetch('/api/files/' + fid + '/comments');
      if (!r.ok) return;
      var j = await r.json();
      render(j.comments || []);
    } catch (e) {}
  }

  function render(items) {
    list.textContent = '';
    var open = 0;
    items.forEach(function (c) {
      if (c.status !== 'resolved') open++;
      var div = document.createElement('div');
      div.className = 'citem' + (c.status === 'resolved' ? ' resolved' : '') + (c.status === 'orphaned' ? ' orphaned' : '');
      var meta = document.createElement('div'); meta.className = 'cmeta'; meta.textContent = c.authorEmail;
      div.appendChild(meta);
      if (c.status === 'orphaned') { var o = document.createElement('div'); o.className = 'corph'; o.textContent = '⚠ 変更された箇所'; div.appendChild(o); }
      if (c.anchorExact) { var q = document.createElement('div'); q.className = 'cquote'; q.textContent = c.anchorExact; div.appendChild(q); }
      var b = document.createElement('div'); b.className = 'cbody'; b.textContent = c.body; div.appendChild(b);
      var act = document.createElement('div'); act.className = 'cact';
      var res = document.createElement('button'); res.type = 'button';
      res.textContent = c.status === 'resolved' ? '未解決に戻す' : '解決';
      res.onclick = function () { toggleResolve(c); };
      act.appendChild(res);
      div.appendChild(act);
      list.appendChild(div);
    });
    if (openCount) openCount.textContent = '未解決 ' + open;
    if (rcount) rcount.textContent = open ? String(open) : '';
  }

  async function toggleResolve(c) {
    try {
      await fetch('/api/comments/' + c.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resolved: c.status !== 'resolved' }) });
      load();
    } catch (e) {}
  }

  function handshake() {
    try {
      var ch = new MessageChannel();
      port = ch.port1;
      port.onmessage = function (e) {
        var d = e.data;
        if (!d || d.t !== 'farleap-select') return; // untrusted hint
        pending = { exact: String(d.exact || '').slice(0, 2000), prefix: String(d.prefix || '').slice(0, 200), suffix: String(d.suffix || '').slice(0, 200) };
        sel.textContent = pending.exact ? ('選択: ' + pending.exact) : '';
      };
      pv.contentWindow.postMessage({ t: 'farleap-init' }, '*', [ch.port2]);
    } catch (e) {}
  }

  send.addEventListener('click', async function () {
    var text = (bodyEl.value || '').trim();
    if (!text) { msg.textContent = '本文を入力してください'; return; }
    msg.textContent = '';
    var payload = { body: text };
    if (pending && pending.exact) payload.anchor = pending;
    try {
      var r = await fetch('/api/files/' + fid + '/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.status === 201) { bodyEl.value = ''; pending = null; sel.textContent = ''; load(); }
      else { var j = await r.json().catch(function () { return {}; }); msg.textContent = '失敗: ' + (j.error || r.status); }
    } catch (e) { msg.textContent = '送信エラー'; }
  });

  btn.addEventListener('click', function () {
    on = !on;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    document.body.classList.toggle('reviewing', on);
    panel.hidden = !on;
    if (on) {
      pv.addEventListener('load', handshake);
      pv.src = pv.getAttribute('data-rsrc');
      load();
    } else {
      pv.removeEventListener('load', handshake);
      port = null;
      pv.src = pv.src.replace(/[?&]review=1/, '');
    }
  });

  var st = document.createElement('style');
  st.textContent = 'body.reviewing #rwrap{display:flex;gap:12px} body.reviewing #pv{flex:1} #cpanel{width:320px;max-height:72vh;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;padding:10px} .cphead{font-weight:600;margin-bottom:8px} .citem{border-bottom:1px solid #f0f0f0;padding:8px 0} .citem.resolved{opacity:.55} .cmeta{font-size:12px;color:#6b7280} .corph{font-size:12px;color:#b45309} .cquote{font-size:12px;color:#6b7280;border-left:2px solid #d1d5db;padding-left:6px;margin:4px 0;white-space:pre-wrap} .cbody{white-space:pre-wrap;margin:2px 0} .csel{font-size:12px;color:#2563eb;margin:6px 0;white-space:pre-wrap} #cbody{width:100%;box-sizing:border-box}';
  document.head.appendChild(st);
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

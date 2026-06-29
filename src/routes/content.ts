import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import type { Env } from "../index";
import { files, fileVersions } from "../db/schema";
import { verifyViewToken } from "../lib/token";

export const content = new Hono<{ Bindings: Env }>();

// Review-mode bootstrap, injected into the (opaque-origin) preview ONLY when
// ?review=1 is present. Per ADR-0006 this is an UNTRUSTED hint channel, not a
// security boundary: it reports the user's text selection to the parent over a
// MessagePort. The parent (App) re-validates everything and only the
// authenticated user's explicit submit creates a comment. Adversarial JS in the
// same document may also read the port and forge hints — acceptable, since hints
// carry no privilege. The injection never relaxes the response headers below
// (sandbox stays opaque; no Set-Cookie).
const REVIEW_BOOTSTRAP = `<script>(function(){
var add=window.addEventListener.bind(window),sel=window.getSelection?window.getSelection.bind(window):null,port=null;
add('message',function init(e){
  if(!e.data||e.data.t!=='farleap-init'||!e.ports||!e.ports[0])return;
  if(port)return;port=e.ports[0];window.removeEventListener('message',init,false);
  add('mouseup',report,true);add('keyup',report,true);
},false);
function report(){
  if(!port||!sel)return;var s=sel();if(!s||s.isCollapsed||!s.rangeCount)return;
  var exact=String(s.toString()).slice(0,2000);if(!exact)return;
  var prefix='',suffix='';try{var r=s.getRangeAt(0),full=(r.startContainer.textContent||''),i=full.indexOf(exact);
    if(i>=0){prefix=full.slice(Math.max(0,i-32),i);suffix=full.slice(i+exact.length,i+exact.length+32);}}catch(_){}
  port.postMessage({t:'farleap-select',exact:exact,prefix:prefix,suffix:suffix});
}
})();</script>`;

// Insert the bootstrap as early as possible so it runs before the uploaded JS.
function injectReview(html: string): string {
  const head = html.search(/<head[^>]*>/i);
  if (head >= 0) {
    const end = html.indexOf(">", head) + 1;
    return html.slice(0, end) + REVIEW_BOOTSTRAP + html.slice(end);
  }
  const htmlTag = html.search(/<html[^>]*>/i);
  if (htmlTag >= 0) {
    const end = html.indexOf(">", htmlTag) + 1;
    return html.slice(0, end) + REVIEW_BOOTSTRAP + html.slice(end);
  }
  return REVIEW_BOOTSTRAP + html;
}

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

  // Optional version selector. Default is the file's current blob (row.r2Key).
  // `v` is an integer seq resolved to a SERVER-side r2Key via fileVersions — never
  // a client-supplied path. Versions inherit the file's permissions, so the
  // file-scoped view token already authorizes them (ADR-0003/0006 untouched).
  // Unknown seq → 404 rather than silently serving the current version.
  let r2Key = row.r2Key;
  const vRaw = c.req.query("v");
  if (vRaw !== undefined) {
    const seq = Number(vRaw);
    if (!Number.isInteger(seq) || seq < 1) return c.text("not found", 404);
    const [ver] = await db
      .select({ r2Key: fileVersions.r2Key })
      .from(fileVersions)
      .where(and(eq(fileVersions.fileId, fileId), eq(fileVersions.seq, seq)))
      .limit(1);
    if (!ver) return c.text("not found", 404);
    r2Key = ver.r2Key;
  }

  const obj = await c.env.BUCKET.get(r2Key);
  if (!obj) return c.text("not found", 404);

  // frame-ancestors must match the scheme the App is actually served on, or the
  // browser blocks the embed. Prod is HTTPS (default); local dev is HTTP and sets
  // APP_SCHEME=http in .dev.vars. Mismatched scheme silently empties the iframe.
  const appScheme = c.env.APP_SCHEME ?? "https";
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "content-security-policy": `frame-ancestors ${appScheme}://${c.env.APP_HOST}; sandbox allow-scripts allow-popups allow-forms;`,
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  };

  // Review mode (opt-in, still token-gated): inject the untrusted selection
  // bridge. Normal viewing streams the original bytes unchanged.
  if (c.req.query("review") === "1") {
    return new Response(injectReview(await obj.text()), { status: 200, headers });
  }
  return new Response(obj.body, { status: 200, headers });
});

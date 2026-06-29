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
// MessagePort, and renders non-privileged comment PINS (the parent sends only
// locating data — id/number/quote — never comment bodies). Clicking a pin posts
// an untrusted focus hint; the parent (App) owns all comment data and privileged
// actions. Adversarial JS here can read/forge these hints — acceptable, since
// they carry no privilege. The injection never relaxes the response headers
// below (sandbox stays opaque; no Set-Cookie).
const REVIEW_BOOTSTRAP = `<script>(function(){
var add=window.addEventListener.bind(window),sel=window.getSelection?window.getSelection.bind(window):null,port=null;
var store=[];
add('message',function init(e){
  if(!e.data||e.data.t!=='farleap-init'||!e.ports||!e.ports[0])return;
  if(port)return;port=e.ports[0];window.removeEventListener('message',init,false);
  add('mouseup',report,true);add('keyup',report,true);add('resize',place,false);
  port.onmessage=function(ev){var d=ev.data;if(!d)return;
    if(d.t==='farleap-comments')renderPins(d.items||[]);
    else if(d.t==='farleap-active')activate(d.id);};
},false);
function report(){
  if(!port||!sel)return;var s=sel();if(!s||s.isCollapsed||!s.rangeCount)return;
  var exact=String(s.toString()).slice(0,2000);if(!exact)return;
  var prefix='',suffix='';try{var r=s.getRangeAt(0),full=(r.startContainer.textContent||''),i=full.indexOf(exact);
    if(i>=0){prefix=full.slice(Math.max(0,i-32),i);suffix=full.slice(i+exact.length,i+exact.length+32);}}catch(_){}
  port.postMessage({t:'farleap-select',exact:exact,prefix:prefix,suffix:suffix});
}
function style(){
  if(document.getElementById('__fl_pin_css'))return;
  var st=document.createElement('style');st.id='__fl_pin_css';
  st.textContent='.__fl-hl{position:absolute;background:rgba(0,184,212,.18);border-radius:2px;pointer-events:none;z-index:2147482000}'
   +'.__fl-pin{position:absolute;z-index:2147483000;min-width:24px;height:24px;padding:0 6px;border:0;cursor:pointer;'
   +'background:#00b8d4;color:#fff;font:700 12px/24px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center;'
   +'border-radius:13px 13px 13px 2px;box-shadow:0 2px 6px rgba(0,0,0,.28);transform:translateY(-26px)}'
   +'.__fl-pin:hover{background:#0097a7}'
   +'.__fl-pin.__fl-on{background:#00838f;box-shadow:0 0 0 3px rgba(0,184,212,.45),0 2px 6px rgba(0,0,0,.28)}';
  (document.head||document.documentElement).appendChild(st);
}
function locate(it){try{var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n;
  while(n=w.nextNode()){var t=n.nodeValue||'',idx=-1;
    if(it.prefix||it.suffix){var need=(it.prefix||'')+it.exact+(it.suffix||''),p=t.indexOf(need);if(p>=0)idx=p+(it.prefix||'').length;}
    if(idx<0)idx=t.indexOf(it.exact);
    if(idx>=0&&it.exact){var rg=document.createRange();rg.setStart(n,idx);rg.setEnd(n,idx+it.exact.length);return rg;}}
}catch(_){}return null;}
function clearPins(){store.forEach(function(s){if(s.pin.parentNode)s.pin.parentNode.removeChild(s.pin);if(s.hl.parentNode)s.hl.parentNode.removeChild(s.hl);});store=[];}
function renderPins(items){clearPins();style();(items||[]).forEach(function(it){
  var rg=locate(it);if(!rg)return;
  var hl=document.createElement('div');hl.className='__fl-hl';document.body.appendChild(hl);
  var pin=document.createElement('button');pin.type='button';pin.className='__fl-pin';
  pin.textContent=String(it.n||'\\u2022');pin.setAttribute('data-id',String(it.id));
  pin.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();
    activate(it.id);if(port)port.postMessage({t:'farleap-focus',id:it.id});});
  document.body.appendChild(pin);
  store.push({id:it.id,range:rg,pin:pin,hl:hl});});
  place();}
function place(){var sx=window.scrollX||window.pageXOffset||0,sy=window.scrollY||window.pageYOffset||0;
  store.forEach(function(s){try{var r=s.range.getBoundingClientRect();
    s.pin.style.left=(r.right+sx)+'px';s.pin.style.top=(r.top+sy)+'px';
    s.hl.style.left=(r.left+sx)+'px';s.hl.style.top=(r.top+sy)+'px';
    s.hl.style.width=Math.max(0,r.width)+'px';s.hl.style.height=Math.max(0,r.height)+'px';}catch(_){}});}
function activate(id){store.forEach(function(s){
  if(String(s.id)===String(id)){s.pin.classList.add('__fl-on');try{s.pin.scrollIntoView({block:'center'});}catch(_){}}
  else s.pin.classList.remove('__fl-on');});}
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

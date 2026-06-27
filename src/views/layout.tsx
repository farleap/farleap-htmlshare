/** @jsxImportSource hono/jsx */
import type { FC, PropsWithChildren } from "hono/jsx";
import { raw } from "hono/html";

// Farleap Design System tokens (source: corporate-site theme.css):
// monochrome ink/canvas + acid-cyan accent, Geist (display/labels) + Noto Sans JP (body),
// uppercase tracked labels, 4/8/16/32/64 spacing. Kept as inline CSS (single SSR file).
const STYLES = `
:root{
  --ink:#0a0a0a; --ink-soft:#3a3a3a; --canvas:#ffffff;
  --acid:#00e5ff; --cyan-deep:#00b8d4; --cyan-pale:#e8fdff;
  --n50:#fafafa; --n100:#f5f5f5; --n200:#ececec; --n300:#dedede;
  --error:#ef4444;
  --font-display:"Geist","Helvetica Neue",Arial,sans-serif;
  --font-body:"Noto Sans JP",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  --font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
  --radius:14px; --radius-sm:10px;
  --shadow:0 1px 2px rgba(10,10,10,.04),0 14px 30px -16px rgba(10,10,10,.18);
}
*{box-sizing:border-box}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{margin:0;font-family:var(--font-body);color:var(--ink);background:var(--n50);line-height:1.6}
a{color:inherit;text-decoration:none}
.label{font-family:var(--font-display);font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft)}

.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;
  padding:14px 24px;background:rgba(255,255,255,.85);backdrop-filter:blur(10px);
  border-bottom:1px solid var(--n200)}
.brand{display:flex;align-items:center;gap:11px}
.brand .mark{width:10px;height:10px;border-radius:50%;background:var(--acid);box-shadow:0 0 0 4px var(--cyan-pale);flex:none}
.brand b{font-family:var(--font-display);font-weight:800;letter-spacing:.05em;font-size:15px}
.brand .sep{width:1px;height:16px;background:var(--n300)}
.brand .sub{font-family:var(--font-display);font-weight:700;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-soft)}
.user{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-soft)}
.avatar{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--ink);color:#fff;
  font-family:var(--font-display);font-weight:700;font-size:12px;flex:none}
.logout{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-display);font-weight:700;font-size:12px;
  color:var(--ink-soft);border:1px solid var(--n300);border-radius:8px;padding:6px 12px;margin-left:4px;
  transition:color .15s ease,border-color .15s ease,background .15s ease}
.logout:hover{color:var(--ink);border-color:var(--ink);background:var(--n50)}
.logout svg{width:14px;height:14px}

main{max-width:1280px;margin:0 auto;padding:40px 32px 88px}
main.wide{max-width:1920px;padding-left:24px;padding-right:24px}

.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:26px;flex-wrap:wrap}
h1.title{font-family:var(--font-display);font-weight:800;letter-spacing:-.025em;font-size:30px;margin:8px 0 0}
.count{font-family:var(--font-display);font-weight:700;font-size:13px;color:var(--ink-soft)}

.btn{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-display);font-weight:700;font-size:13px;
  letter-spacing:.02em;cursor:pointer;border:0;border-radius:10px;padding:11px 18px;background:var(--ink);color:#fff;
  transition:transform .15s ease,box-shadow .2s ease,background .2s ease}
.btn:hover{background:#000;box-shadow:0 10px 24px -10px rgba(0,0,0,.55)}
.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.55;cursor:default;box-shadow:none}
.btn svg{width:16px;height:16px}
.btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--n300)}
.btn-ghost:hover{background:var(--n50);border-color:var(--ink);box-shadow:none}
:focus-visible{outline:2px solid var(--cyan-deep);outline-offset:2px;border-radius:6px}

.drop{display:flex;align-items:center;gap:18px;padding:22px 22px;background:#fff;border:1.5px dashed var(--n300);
  border-radius:var(--radius);transition:border-color .2s ease,background .2s ease,box-shadow .2s ease;
  margin-bottom:14px;flex-wrap:wrap;cursor:pointer}
.drop:hover,.drop:focus-within,.drop.is-drag{border-color:var(--cyan-deep);background:var(--cyan-pale)}
.drop.is-drag{box-shadow:0 0 0 4px var(--cyan-pale)}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.drop .ic{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:var(--n100);color:var(--ink)}
.drop .ic svg{width:22px;height:22px}
.drop .txt{flex:1;min-width:0}
.drop .txt b{font-family:var(--font-display);font-weight:700;display:block;font-size:15px}
.drop .txt small{color:var(--ink-soft);font-size:12.5px}
.drop input[type=file]{font:inherit;font-size:12.5px;color:var(--ink-soft);max-width:230px}
.msg{font-size:13px;color:var(--error);margin:6px 2px 24px;min-height:1px}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(284px,1fr));gap:16px}
.fcard{position:relative;display:flex;flex-direction:column;gap:14px;padding:18px;background:#fff;border:1px solid var(--n200);
  border-radius:var(--radius);cursor:pointer;transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}
.fcard:hover{border-color:var(--cyan-deep);box-shadow:var(--shadow);transform:translateY(-2px)}
/* Stretched link: the title anchor covers the whole card so any click opens it. */
.fcard h3 a::after{content:"";position:absolute;inset:0;border-radius:var(--radius);z-index:0}
.fcard .row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
/* Actions sit above the stretched link so their own clicks win. */
.top-actions{display:flex;align-items:center;gap:8px;position:relative;z-index:2}
.iconbtn{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;border:1px solid #f3d0d0;
  background:#fff;color:var(--error);cursor:pointer;transition:color .15s ease,border-color .15s ease,background .15s ease}
.iconbtn:hover{color:var(--error);border-color:var(--error);background:#fff5f5}
.iconbtn:disabled{opacity:.5;cursor:default}
.iconbtn svg{width:15px;height:15px}
.doc{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:var(--cyan-pale);color:var(--cyan-deep);flex:none}
.doc svg{width:20px;height:20px}
.tag{font-family:var(--font-display);font-weight:700;font-size:10px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ink);background:var(--cyan-pale);padding:4px 9px;border-radius:999px;border:1px solid #cdf3f8}
.fcard h3{font-family:var(--font-display);font-weight:700;font-size:16px;margin:0;line-height:1.4;
  word-break:break-word}
.fcard h3 a:hover{color:var(--cyan-deep)}
.meta{display:flex;align-items:center;gap:14px;font-size:12px;color:var(--ink-soft);flex-wrap:wrap;margin-top:auto}
.meta .m{display:inline-flex;align-items:center;gap:5px}
.meta svg{width:13px;height:13px;opacity:.7}

.empty{grid-column:1/-1;padding:54px 24px;text-align:center;border:1.5px dashed var(--n300);border-radius:var(--radius);
  color:var(--ink-soft);background:#fff}
.empty svg{width:34px;height:34px;opacity:.4;margin-bottom:8px}

.back{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-display);font-weight:700;font-size:13px;
  color:var(--ink-soft);margin-bottom:16px}
.back:hover{color:var(--ink)}
.back svg{width:15px;height:15px}
.detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.detail-head h1{font-family:var(--font-display);font-weight:800;letter-spacing:-.025em;font-size:26px;margin:6px 0 8px;line-height:1.25}

.frame{background:#fff;border:1px solid var(--n200);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
.frame .bar{display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid var(--n200);background:var(--n50)}
.dots{display:flex;gap:6px;flex:none}
.dots i{width:11px;height:11px;border-radius:50%;background:var(--n300);display:block}
.frame .bar .u{font-family:var(--font-mono);font-size:12px;color:var(--ink-soft);background:#fff;border:1px solid var(--n200);
  border-radius:8px;padding:5px 12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.frame iframe{display:block;width:100%;height:85vh;border:0;background:#fff}

.notice{background:#fff;border:1px solid var(--n200);border-radius:var(--radius);padding:40px;text-align:center;color:var(--ink-soft)}

@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
@media (max-width:640px){main{padding:28px 16px 64px}h1.title{font-size:24px}.detail-head h1{font-size:22px}.frame iframe{height:70vh}}
`;

export const Layout: FC<PropsWithChildren<{ title: string; user?: string; wide?: boolean }>> = ({
  title,
  user,
  wide,
  children,
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · Farleap HTML Share</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;700&display=swap"
      />
      {raw(`<style>${STYLES}</style>`)}
    </head>
    <body>
      <header class="topbar">
        <a class="brand" href="/" aria-label="Farleap HTML Share home">
          <span class="mark"></span>
          <b>FARLEAP</b>
          <span class="sep"></span>
          <span class="sub">HTML Share</span>
        </a>
        {user ? (
          <div class="user">
            <span class="avatar">{user.charAt(0).toUpperCase()}</span>
            <span>{user}</span>
            {/* Cloudflare Access logout — handled at the edge (/cdn-cgi/access/*), clears the session. */}
            <a class="logout" href="/cdn-cgi/access/logout">
              {raw(
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
              )}
              ログアウト
            </a>
          </div>
        ) : null}
      </header>
      <main class={wide ? "wide" : ""}>{children}</main>
    </body>
  </html>
);

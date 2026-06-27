/** @jsxImportSource hono/jsx */
import type { FC } from "hono/jsx";

export const Layout: FC<{ title: string }> = ({ title, children }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style>{`body{font-family:system-ui,sans-serif;margin:0;color:#0C2D42}
        header{padding:12px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between}
        main{max-width:1100px;margin:0 auto;padding:20px}
        iframe{width:100%;height:80vh;border:1px solid #e5e7eb;border-radius:8px}
        .card{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:8px 0}`}</style>
    </head>
    <body>
      <header><strong>Farleap HTML Share</strong></header>
      <main>{children}</main>
    </body>
  </html>
);

import { defineConfig } from "@playwright/test";

// App面 = 127.0.0.1:8787, Content面 = localhost:8787 (.dev.vars 参照).
// 同一 wrangler dev サーバだが別オリジンとして扱われるため、本番のオリジン分離を
// dev でも再現できる。BASE_URL で本番URLに差し替えると同じ spec を本番回帰に使える。
const APP = process.env.BASE_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: APP,
    // Dev-only Access bypass: authGuard() trusts X-Test-Email when ACCESS_AUD === "test-bypass"
    // (set in .dev.vars). Applied to every page navigation AND request fixture call so
    // page.goto on Access-protected routes (/f/*, /s/*) passes the gate. Inert in prod.
    extraHTTPHeaders: { "X-Test-Email": "a@farleap.co.jp" },
  },
  // 本番回帰 (BASE_URL 指定時) はローカルサーバを立てない。
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "bunx wrangler dev --port 8787",
        url: "http://127.0.0.1:8787/healthz",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

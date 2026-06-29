import { Hono } from "hono";
import { authGuard } from "./lib/auth";
import { upload } from "./routes/upload";
import { content } from "./routes/content";
import { pages } from "./routes/pages";
import { manage } from "./routes/manage";
import { versions } from "./routes/versions";
import { commentsRoute } from "./routes/comments";
import { purgeExpired } from "./cron";
import { isContentRequest } from "./lib/routing";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  TOKEN_SECRET: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  APP_HOST: string;
  CONTENT_HOST: string;
  ALLOWED_DOMAINS: string;
  // Scheme the App is served on, used to build the Content CSP frame-ancestors.
  // Defaults to "https" (production); local dev sets "http" via .dev.vars.
  APP_SCHEME?: string;
};

const app = new Hono<{ Bindings: Env }>();

// Content routing — must be FIRST so content requests never reach authGuard.
// Two modes:
//  - Two-host (prod with a custom App domain, or local dev): the Content host is a
//    separate hostname; route everything on that host to Content.
//  - Single-host (App and Content share one hostname, e.g. behind Cloudflare Access
//    on the workers.dev URL): only `/p/*` is Content; everything else is the App.
//    Access bypasses `/p/*` (token-protected), and gates the rest with Google login.
app.use("*", async (c, next) => {
  // Derive host from the request URL (Host header may not be set explicitly in tests).
  const url = new URL(c.req.url);
  if (
    isContentRequest({
      host: url.host,
      pathname: url.pathname,
      appHost: c.env.APP_HOST,
      contentHost: c.env.CONTENT_HOST,
    })
  ) {
    return content.fetch(c.req.raw, c.env, c.executionCtx);
  }
  await next();
});

app.get("/healthz", (c) => c.json({ ok: true }));

app.use("/api/*", authGuard());
app.use("/s/*", authGuard());
app.use("/", authGuard());
app.use("/f/*", authGuard());
app.route("/", upload);
app.route("/", pages);
app.route("/", manage);
app.route("/", versions);
app.route("/", commentsRoute);

// Named export kept for clarity; the default export carries both the request
// and the cron handler. `app.fetch` is a bound arrow function on the Hono
// instance, so detaching it here keeps existing `import app; app.fetch(...)`
// tests working unchanged.
export { app };

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpired(env, Math.floor(Date.now() / 1000)).then(() => {}));
  },
};

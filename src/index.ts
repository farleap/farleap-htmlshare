import { Hono } from "hono";
import { authGuard } from "./lib/auth";
import { upload } from "./routes/upload";
import { content } from "./routes/content";
import { pages } from "./routes/pages";
import { manage } from "./routes/manage";
import { purgeExpired } from "./cron";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  TOKEN_SECRET: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  APP_HOST: string;
  CONTENT_HOST: string;
  ALLOWED_DOMAINS: string;
};

const app = new Hono<{ Bindings: Env }>();

// Content-host middleware: must be FIRST so content-origin requests never reach authGuard.
app.use("*", async (c, next) => {
  // Derive host from the request URL (Host header may not be set explicitly in tests).
  const host = new URL(c.req.url).host;
  if (host === c.env.CONTENT_HOST) {
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

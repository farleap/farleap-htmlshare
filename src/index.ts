import { Hono } from "hono";
import { authGuard } from "./lib/auth";
import { upload } from "./routes/upload";

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

app.get("/healthz", (c) => c.json({ ok: true }));

app.use("/api/*", authGuard());
app.route("/", upload);

export default app;

import { Hono } from "hono";

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

export default app;

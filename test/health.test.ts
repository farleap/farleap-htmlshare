import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("healthz", () => {
  it("returns ok", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://localhost/healthz"), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

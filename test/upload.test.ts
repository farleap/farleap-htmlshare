import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { extractTitle, looksLikeHtml } from "../src/lib/html";

// Access is bypassed in tests by setting a test-only header trust (see Task 5 Step 4 note).
function form(htmlContent: string, name = "doc.html") {
  const fd = new FormData();
  fd.append("file", new File([htmlContent], name, { type: "text/html" }));
  return fd;
}

describe("html helpers", () => {
  it("extracts title", () => {
    expect(extractTitle("<title>Hello</title>", "fb")).toBe("Hello");
    expect(extractTitle("<h1>no title</h1>", "fb.html")).toBe("fb.html");
  });
  it("detects html", () => {
    expect(looksLikeHtml(new TextEncoder().encode("<!DOCTYPE html><html>"))).toBe(true);
    expect(looksLikeHtml(new TextEncoder().encode("\x00\x01binary"))).toBe(false);
  });
});

describe("POST /api/files", () => {
  it("stores an html file and returns ids", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://localhost/api/files", {
      method: "POST", headers: { "X-Test-Email": "a@farleap.co.jp" }, body: form("<title>Doc</title><h1>Hi</h1>"),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(201);
    const j = await res.json<{ id: string; viewUrl: string; shareUrl: string }>();
    expect(j.id).toBeTruthy();
    const obj = await env.BUCKET.get(`files/${j.id}/v1.html`);
    expect(obj).not.toBeNull();
  });

  it("rejects non-html", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://localhost/api/files", {
      method: "POST", headers: { "X-Test-Email": "a@farleap.co.jp" },
      body: form("\x00\x01\x02not html", "x.html"),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(415);
  });
});

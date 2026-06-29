import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { drizzle } from "drizzle-orm/d1";
import { files } from "../src/db/schema";

async function seed(owner: string) {
  const id = crypto.randomUUID();
  await env.BUCKET.put(`files/${id}/v1.html`, "<h1>x</h1>");
  await drizzle(env.DB).insert(files).values({
    id, ownerEmail: owner, title: "t", r2Key: `files/${id}/v1.html`,
    sizeBytes: 5, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 100,
    currentVersionId: `${id}-v1`,
  });
  return id;
}
const hdr = (email: string) => ({ host: "docs.local", "X-Test-Email": email });
const json = (email: string) => ({ ...hdr(email), "content-type": "application/json" });

async function call(req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("comments", () => {
  it("any authenticated user (not just owner) can create, and it lists", async () => {
    const id = await seed("a@farleap.co.jp");
    const post = await call(new Request(`http://docs.local/api/files/${id}/comments`, {
      method: "POST", headers: json("b@farleap.co.jp"),
      body: JSON.stringify({ body: "looks off", anchor: { exact: "x", prefix: "<h1>", suffix: "</h1>" } }),
    }));
    expect(post.status).toBe(201);
    const { id: cid } = await post.json<{ id: string }>();
    expect(cid).toBeTruthy();

    const list = await call(new Request(`http://docs.local/api/files/${id}/comments`, { headers: hdr("a@farleap.co.jp") }));
    expect(list.status).toBe(200);
    const { comments } = await list.json<{ comments: any[] }>();
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("looks off");
    expect(comments[0].authorEmail).toBe("b@farleap.co.jp");
    expect(comments[0].status).toBe("active");
    expect(comments[0].versionId).toBe(`${id}-v1`);
    expect(comments[0].anchorExact).toBe("x");
  });

  it("empty body is rejected", async () => {
    const id = await seed("a@farleap.co.jp");
    const res = await call(new Request(`http://docs.local/api/files/${id}/comments`, {
      method: "POST", headers: json("a@farleap.co.jp"), body: JSON.stringify({ body: "   " }),
    }));
    expect(res.status).toBe(400);
  });

  it("commenting on a missing file is 404", async () => {
    const res = await call(new Request(`http://docs.local/api/files/nope/comments`, {
      method: "POST", headers: json("a@farleap.co.jp"), body: JSON.stringify({ body: "hi" }),
    }));
    expect(res.status).toBe(404);
  });

  it("author can resolve; status flips to resolved", async () => {
    const id = await seed("a@farleap.co.jp");
    const post = await call(new Request(`http://docs.local/api/files/${id}/comments`, {
      method: "POST", headers: json("b@farleap.co.jp"), body: JSON.stringify({ body: "fix this" }),
    }));
    const { id: cid } = await post.json<{ id: string }>();
    const patch = await call(new Request(`http://docs.local/api/comments/${cid}`, {
      method: "PATCH", headers: json("b@farleap.co.jp"), body: JSON.stringify({ resolved: true }),
    }));
    expect(patch.status).toBe(200);
    const list = await call(new Request(`http://docs.local/api/files/${id}/comments`, { headers: hdr("a@farleap.co.jp") }));
    const { comments } = await list.json<{ comments: any[] }>();
    expect(comments[0].status).toBe("resolved");
    expect(comments[0].resolved).toBe(1);
  });

  it("non-author cannot edit body, but file owner can resolve", async () => {
    const id = await seed("owner@farleap.co.jp");
    const post = await call(new Request(`http://docs.local/api/files/${id}/comments`, {
      method: "POST", headers: json("author@farleap.co.jp"), body: JSON.stringify({ body: "hello" }),
    }));
    const { id: cid } = await post.json<{ id: string }>();
    const edit = await call(new Request(`http://docs.local/api/comments/${cid}`, {
      method: "PATCH", headers: json("other@farleap.co.jp"), body: JSON.stringify({ body: "hacked" }),
    }));
    expect(edit.status).toBe(403);
    const resolveByOwner = await call(new Request(`http://docs.local/api/comments/${cid}`, {
      method: "PATCH", headers: json("owner@farleap.co.jp"), body: JSON.stringify({ resolved: true }),
    }));
    expect(resolveByOwner.status).toBe(200);
  });

  it("only the author can delete", async () => {
    const id = await seed("a@farleap.co.jp");
    const post = await call(new Request(`http://docs.local/api/files/${id}/comments`, {
      method: "POST", headers: json("author@farleap.co.jp"), body: JSON.stringify({ body: "bye" }),
    }));
    const { id: cid } = await post.json<{ id: string }>();
    const forbidden = await call(new Request(`http://docs.local/api/comments/${cid}`, {
      method: "DELETE", headers: hdr("stranger@farleap.co.jp"),
    }));
    expect(forbidden.status).toBe(403);
    const ok = await call(new Request(`http://docs.local/api/comments/${cid}`, {
      method: "DELETE", headers: hdr("author@farleap.co.jp"),
    }));
    expect(ok.status).toBe(204);
    const list = await call(new Request(`http://docs.local/api/files/${id}/comments`, { headers: hdr("a@farleap.co.jp") }));
    const { comments } = await list.json<{ comments: any[] }>();
    expect(comments).toHaveLength(0);
  });

  it("oversized anchor is rejected", async () => {
    const id = await seed("a@farleap.co.jp");
    const res = await call(new Request(`http://docs.local/api/files/${id}/comments`, {
      method: "POST", headers: json("a@farleap.co.jp"),
      body: JSON.stringify({ body: "ok", anchor: { exact: "y".repeat(2001) } }),
    }));
    expect(res.status).toBe(413);
  });
});

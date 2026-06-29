import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

async function seedFile(owner = "a@farleap.co.jp") {
  const id = crypto.randomUUID();
  const { drizzle } = await import("drizzle-orm/d1");
  const { files } = await import("../src/db/schema");
  await drizzle(env.DB).insert(files).values({
    id, ownerEmail: owner, title: "My Deck", r2Key: `files/${id}/v1.html`,
    sizeBytes: 5, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 9_999_999_999,
  });
  return id;
}

describe("detail page", () => {
  it("embeds a sandboxed iframe without allow-same-origin", async () => {
    const id = await seedFile();
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/f/${id}`, {
      headers: { host: "docs.local", "X-Test-Email": "a@farleap.co.jp" },
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain(`//content.local/p/${id}?t=`);
  });

  it("returns 404 for missing file", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/f/nonexistent-id`, {
      headers: { host: "docs.local", "X-Test-Email": "a@farleap.co.jp" },
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("削除されたか存在しません");
  });

  it("dashboard returns 200 with upload form", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://docs.local/`, {
      headers: { host: "docs.local", "X-Test-Email": "a@farleap.co.jp" },
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<form");
    expect(html).toContain("Dashboard");
  });
});

async function seedVersioned(owner = "a@farleap.co.jp") {
  const id = crypto.randomUUID();
  const { drizzle } = await import("drizzle-orm/d1");
  const { files, fileVersions } = await import("../src/db/schema");
  const db = drizzle(env.DB);
  await db.insert(files).values({
    id, ownerEmail: owner, title: "My Deck", r2Key: `files/${id}/v2.html`,
    sizeBytes: 5, contentHash: "h", createdAt: 1, updatedAt: 1, expiresAt: 9_999_999_999,
    currentVersionId: `${id}-v2`,
  });
  await db.insert(fileVersions).values([
    { id: `${id}-v1`, fileId: id, seq: 1, r2Key: `files/${id}/v1.html`, authorEmail: owner, createdAt: 1, note: "first" },
    { id: `${id}-v2`, fileId: id, seq: 2, r2Key: `files/${id}/v2.html`, authorEmail: owner, createdAt: 2, note: "second" },
  ]);
  return id;
}

const detail = (id: string, email: string, query = "") =>
  app.fetch(
    new Request(`http://docs.local/f/${id}${query}`, { headers: { host: "docs.local", "X-Test-Email": email } }),
    env,
    createExecutionContext(),
  );

describe("detail page — versions", () => {
  it("shows the version strip and owner-only replace control with multiple versions", async () => {
    const id = await seedVersioned("a@farleap.co.jp");
    const html = await (await detail(id, "a@farleap.co.jp")).text();
    expect(html).toContain('class="vstrip"');
    expect(html).toContain("版 2（現在）");
    expect(html).toContain("版 1");
    expect(html).toContain("second"); // current version's note
    expect(html).toContain('id="replace"');
    expect(html).toContain("新版を差し替え");
  });

  it("hides the replace control from non-owners", async () => {
    const id = await seedVersioned("a@farleap.co.jp");
    const html = await (await detail(id, "viewer@farleap.co.jp")).text();
    expect(html).not.toContain('id="replace"');
    expect(html).not.toContain("新版を差し替え");
    expect(html).toContain('class="vstrip"'); // history is still visible to viewers
  });

  it("?v=<seq> renders the past-version banner and points the iframe at that version", async () => {
    const id = await seedVersioned("a@farleap.co.jp");
    const html = await (await detail(id, "a@farleap.co.jp", "?v=1")).text();
    expect(html).toContain("過去の版（版 1）を表示中");
    expect(html).toMatch(/<iframe[^>]*\bsrc="[^"]*v=1[^"]*"/);
  });

  it("ignores an unknown ?v and shows the current version (no banner)", async () => {
    const id = await seedVersioned("a@farleap.co.jp");
    const html = await (await detail(id, "a@farleap.co.jp", "?v=99")).text();
    expect(html).not.toContain("過去の版");
  });
});

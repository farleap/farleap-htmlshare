import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { drizzle } from "drizzle-orm/d1";
import { eq, asc } from "drizzle-orm";
import { files, fileVersions, comments } from "../src/db/schema";

// Seed a live file with its v1 version row (mirrors upload.ts / the backfill).
async function seed(
  owner: string,
  opts: { html?: string; pinned?: 0 | 1; deleted?: boolean } = {},
) {
  const id = crypto.randomUUID();
  const html = opts.html ?? "<h1>v1</h1>";
  await env.BUCKET.put(`files/${id}/v1.html`, html);
  const db = drizzle(env.DB);
  await db.insert(files).values({
    id,
    ownerEmail: owner,
    title: "t",
    r2Key: `files/${id}/v1.html`,
    sizeBytes: html.length,
    contentHash: "h",
    createdAt: 1,
    updatedAt: 1,
    expiresAt: 100,
    pinned: opts.pinned ?? 0,
    currentVersionId: `${id}-v1`,
    deletedAt: opts.deleted ? 2 : null,
  });
  await db.insert(fileVersions).values({
    id: `${id}-v1`,
    fileId: id,
    seq: 1,
    r2Key: `files/${id}/v1.html`,
    authorEmail: owner,
    createdAt: 1,
    note: null,
  });
  return id;
}

function form(html: string, note?: string) {
  const fd = new FormData();
  fd.append("file", new File([html], "v.html", { type: "text/html" }));
  if (note !== undefined) fd.append("note", note);
  return fd;
}

async function call(req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// FormData bodies must not carry an explicit content-type (the runtime sets the
// multipart boundary). Only the auth header is supplied.
const post = (id: string, email: string, body: FormData) =>
  call(
    new Request(`http://docs.local/api/files/${id}/versions`, {
      method: "POST",
      headers: { "X-Test-Email": email },
      body,
    }),
  );

async function seedComment(
  fileId: string,
  c: {
    status?: string;
    resolved?: 0 | 1;
    exact?: string | null;
    prefix?: string | null;
    suffix?: string | null;
    versionId?: string | null;
  },
) {
  const cid = crypto.randomUUID();
  await drizzle(env.DB)
    .insert(comments)
    .values({
      id: cid,
      fileId,
      versionId: c.versionId ?? `${fileId}-v1`,
      authorEmail: "r@farleap.co.jp",
      body: "note",
      createdAt: 1,
      status: c.status ?? "active",
      resolved: c.resolved ?? 0,
      parentId: null,
      anchorExact: c.exact ?? null,
      anchorPrefix: c.prefix ?? null,
      anchorSuffix: c.suffix ?? null,
      anchorStart: null,
      anchorEnd: null,
    });
  return cid;
}

async function getComment(cid: string) {
  const [row] = await drizzle(env.DB).select().from(comments).where(eq(comments.id, cid)).limit(1);
  return row;
}

describe("versions — new-version upload", () => {
  it("owner uploads a new version: 201, seq advances, pointer + blob move, retention resets", async () => {
    const id = await seed("a@farleap.co.jp");
    const res = await post(id, "a@farleap.co.jp", form("<h1>v2</h1>", "feedback applied"));
    expect(res.status).toBe(201);
    const j = await res.json<{ id: string; seq: number; viewUrl: string; reanchored: { followed: number; orphaned: number } }>();
    expect(j.seq).toBe(2);
    expect(j.id).toBe(`${id}-v2`);
    expect(j.viewUrl).toBe(`/f/${id}`);

    const db = drizzle(env.DB);
    const [f] = await db.select().from(files).where(eq(files.id, id)).limit(1);
    expect(f.currentVersionId).toBe(`${id}-v2`);
    expect(f.r2Key).toBe(`files/${id}/v2.html`);
    expect(f.title).toBe("t"); // inherited, not rebuilt from the new HTML
    expect(f.expiresAt!).toBeGreaterThan(100); // retention restarts from latest version

    const vs = await db.select().from(fileVersions).where(eq(fileVersions.fileId, id)).orderBy(asc(fileVersions.seq));
    expect(vs.map((v) => v.seq)).toEqual([1, 2]);
    expect(vs[1].note).toBe("feedback applied");
    expect(vs[1].authorEmail).toBe("a@farleap.co.jp");

    const blob = await env.BUCKET.get(`files/${id}/v2.html`);
    expect(blob).not.toBeNull();
    expect(await blob!.text()).toBe("<h1>v2</h1>");
  });

  it("a third version increments seq to 3", async () => {
    const id = await seed("a@farleap.co.jp");
    await post(id, "a@farleap.co.jp", form("<h1>v2</h1>"));
    const res = await post(id, "a@farleap.co.jp", form("<h1>v3</h1>"));
    const j = await res.json<{ seq: number; id: string }>();
    expect(j.seq).toBe(3);
    expect(j.id).toBe(`${id}-v3`);
  });

  it("non-owner is forbidden", async () => {
    const id = await seed("a@farleap.co.jp");
    const res = await post(id, "b@farleap.co.jp", form("<h1>v2</h1>"));
    expect(res.status).toBe(403);
  });

  it("missing file is 404", async () => {
    const res = await post("nope", "a@farleap.co.jp", form("<h1>v2</h1>"));
    expect(res.status).toBe(404);
  });

  it("deleted (tombstoned) file is 404", async () => {
    const id = await seed("a@farleap.co.jp", { deleted: true });
    const res = await post(id, "a@farleap.co.jp", form("<h1>v2</h1>"));
    expect(res.status).toBe(404);
  });

  it("non-html is rejected", async () => {
    const id = await seed("a@farleap.co.jp");
    const res = await post(id, "a@farleap.co.jp", form("\x00\x01 not html"));
    expect(res.status).toBe(415);
  });

  it("a pinned file keeps expiresAt null after a new version", async () => {
    const id = await seed("a@farleap.co.jp", { pinned: 1 });
    await post(id, "a@farleap.co.jp", form("<h1>v2</h1>"));
    const [f] = await drizzle(env.DB).select().from(files).where(eq(files.id, id)).limit(1);
    expect(f.expiresAt).toBeNull();
  });
});

describe("versions — comment re-anchoring (ADR-0005)", () => {
  it("follows an unresolved comment whose quote survives, re-pinning to the new version", async () => {
    const id = await seed("a@farleap.co.jp", { html: "<p>The quick brown fox</p>" });
    const cid = await seedComment(id, { exact: "quick brown", prefix: "The ", suffix: " fox" });

    const v2 = "<h1>Title</h1><p>The quick brown fox</p>"; // quote present but shifted
    const res = await post(id, "a@farleap.co.jp", form(v2));
    const j = await res.json<{ reanchored: { followed: number; orphaned: number } }>();
    expect(j.reanchored).toEqual({ followed: 1, orphaned: 0 });

    const cm = await getComment(cid);
    expect(cm.status).toBe("active");
    expect(cm.versionId).toBe(`${id}-v2`);
    expect(v2.slice(cm.anchorStart!, cm.anchorEnd!)).toBe("quick brown");
  });

  it("orphans an unresolved comment whose quote was rewritten, preserving the old anchor/version", async () => {
    const id = await seed("a@farleap.co.jp", { html: "<p>obsolete line here</p>" });
    const cid = await seedComment(id, { exact: "obsolete line", prefix: "<p>", suffix: " here" });

    const res = await post(id, "a@farleap.co.jp", form("<p>completely different</p>"));
    const j = await res.json<{ reanchored: { followed: number; orphaned: number } }>();
    expect(j.reanchored).toEqual({ followed: 0, orphaned: 1 });

    const cm = await getComment(cid);
    expect(cm.status).toBe("orphaned");
    expect(cm.versionId).toBe(`${id}-v1`); // old pin preserved
    expect(cm.anchorExact).toBe("obsolete line"); // old quote preserved for manual re-link
  });

  it("leaves resolved comments untouched even if their quote still matches", async () => {
    const id = await seed("a@farleap.co.jp", { html: "<p>The quick brown fox</p>" });
    const cid = await seedComment(id, {
      status: "resolved",
      resolved: 1,
      exact: "quick brown",
      prefix: "The ",
      suffix: " fox",
    });

    const res = await post(id, "a@farleap.co.jp", form("<p>The quick brown fox</p>"));
    const j = await res.json<{ reanchored: { followed: number; orphaned: number } }>();
    expect(j.reanchored).toEqual({ followed: 0, orphaned: 0 });

    const cm = await getComment(cid);
    expect(cm.status).toBe("resolved");
    expect(cm.versionId).toBe(`${id}-v1`);
  });

  it("carries over a non-inline (no-anchor) comment without orphaning it", async () => {
    const id = await seed("a@farleap.co.jp");
    const cid = await seedComment(id, { exact: null });

    const res = await post(id, "a@farleap.co.jp", form("<h1>v2</h1>"));
    const j = await res.json<{ reanchored: { followed: number; orphaned: number } }>();
    expect(j.reanchored).toEqual({ followed: 0, orphaned: 0 });

    const cm = await getComment(cid);
    expect(cm.status).toBe("active");
    expect(cm.versionId).toBe(`${id}-v1`);
  });

  it("re-follows a previously orphaned comment when its quote reappears", async () => {
    const id = await seed("a@farleap.co.jp", { html: "<p>nothing</p>" });
    const cid = await seedComment(id, { status: "orphaned", exact: "phoenix rises" });

    const res = await post(id, "a@farleap.co.jp", form("<p>the phoenix rises again</p>"));
    const j = await res.json<{ reanchored: { followed: number; orphaned: number } }>();
    expect(j.reanchored).toEqual({ followed: 1, orphaned: 0 });

    const cm = await getComment(cid);
    expect(cm.status).toBe("active");
    expect(cm.versionId).toBe(`${id}-v2`);
  });
});

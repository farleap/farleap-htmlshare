import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  r2Key: text("r2_key").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  expiresAt: integer("expires_at"),
  pinned: integer("pinned").notNull().default(0),
  orgVisibility: text("org_visibility").notNull().default("org_view"),
  currentVersionId: text("current_version_id"),
  deletedAt: integer("deleted_at"),
});

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull(),
  token: text("token").notNull().unique(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at"),
  scope: text("scope").notNull().default("internal"),
  revoked: integer("revoked").notNull().default(0),
});

// Each upload creates one version row (seq = 1, 2, ...); files.currentVersionId
// points at the latest. V1 rows are backfilled to a single seq=1 version.
export const fileVersions = sqliteTable(
  "file_versions",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id").notNull(),
    seq: integer("seq").notNull(),
    r2Key: text("r2_key").notNull(),
    authorEmail: text("author_email").notNull(),
    createdAt: integer("created_at").notNull(),
    note: text("note"),
  },
  (t) => ({
    fileSeqIdx: index("file_versions_file_seq_idx").on(t.fileId, t.seq),
  }),
);

// Comments are pinned to the version they were made on (versionId). status is
// the lifecycle: active (anchored) | orphaned (lost its anchor on a new version)
// | resolved. The legacy `resolved` flag is kept for back-compat.
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id").notNull(),
    versionId: text("version_id"),
    authorEmail: text("author_email").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
    status: text("status").notNull().default("active"),
    resolved: integer("resolved").notNull().default(0),
    parentId: text("parent_id"),
    anchorExact: text("anchor_exact"),
    anchorPrefix: text("anchor_prefix"),
    anchorSuffix: text("anchor_suffix"),
    anchorStart: integer("anchor_start"),
    anchorEnd: integer("anchor_end"),
  },
  (t) => ({
    fileVersionIdx: index("comments_file_version_idx").on(t.fileId, t.versionId),
  }),
);

export const permissions = sqliteTable("permissions", {
  fileId: text("file_id").notNull(),
  userEmail: text("user_email").notNull(),
  role: text("role").notNull(),
});

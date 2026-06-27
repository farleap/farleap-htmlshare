import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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

// Defined now for forward-compatibility; unused in V1.
export const fileVersions = sqliteTable("file_versions", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull(),
  r2Key: text("r2_key").notNull(),
  authorEmail: text("author_email").notNull(),
  createdAt: integer("created_at").notNull(),
  note: text("note"),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  fileId: text("file_id").notNull(),
  versionId: text("version_id"),
  authorEmail: text("author_email").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
  resolved: integer("resolved").notNull().default(0),
  parentId: text("parent_id"),
  anchorExact: text("anchor_exact"),
  anchorPrefix: text("anchor_prefix"),
  anchorSuffix: text("anchor_suffix"),
  anchorStart: integer("anchor_start"),
  anchorEnd: integer("anchor_end"),
});

export const permissions = sqliteTable("permissions", {
  fileId: text("file_id").notNull(),
  userEmail: text("user_email").notNull(),
  role: text("role").notNull(),
});

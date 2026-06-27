CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`version_id` text,
	`author_email` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`anchor_exact` text,
	`anchor_prefix` text,
	`anchor_suffix` text,
	`anchor_start` integer,
	`anchor_end` integer
);
--> statement-breakpoint
CREATE TABLE `file_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`author_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`title` text NOT NULL,
	`r2_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`pinned` integer DEFAULT 0 NOT NULL,
	`org_visibility` text DEFAULT 'org_view' NOT NULL,
	`current_version_id` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`file_id` text NOT NULL,
	`user_email` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`token` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`scope` text DEFAULT 'internal' NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_unique` ON `share_links` (`token`);
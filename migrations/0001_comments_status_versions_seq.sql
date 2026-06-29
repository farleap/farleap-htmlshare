ALTER TABLE `comments` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE INDEX `comments_file_version_idx` ON `comments` (`file_id`,`version_id`);--> statement-breakpoint
ALTER TABLE `file_versions` ADD `seq` integer NOT NULL;--> statement-breakpoint
CREATE INDEX `file_versions_file_seq_idx` ON `file_versions` (`file_id`,`seq`);
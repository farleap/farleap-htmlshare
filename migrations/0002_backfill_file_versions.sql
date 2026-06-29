-- Data migration (hand-written): backfill one version (seq=1) per existing file
-- and point files.current_version_id at it. Idempotent via the
-- `current_version_id IS NULL` guard and a deterministic version id (<file id>-v1).
INSERT INTO file_versions (id, file_id, seq, r2_key, author_email, created_at, note)
SELECT id || '-v1', id, 1, r2_key, owner_email, created_at, NULL
FROM files
WHERE current_version_id IS NULL;--> statement-breakpoint
UPDATE files
SET current_version_id = id || '-v1'
WHERE current_version_id IS NULL;

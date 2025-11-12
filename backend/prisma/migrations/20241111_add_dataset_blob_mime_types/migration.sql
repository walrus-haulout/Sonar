ALTER TABLE "DatasetBlob"
  ADD COLUMN IF NOT EXISTS "mime_type" TEXT;

ALTER TABLE "DatasetBlob"
  ADD COLUMN IF NOT EXISTS "preview_mime_type" TEXT;

-- Ensure default and non-null constraint for MIME type
UPDATE "DatasetBlob"
SET "mime_type" = 'audio/mpeg'
WHERE "mime_type" IS NULL;

ALTER TABLE "DatasetBlob"
  ALTER COLUMN "mime_type" SET DEFAULT 'audio/mpeg';

ALTER TABLE "DatasetBlob"
  ALTER COLUMN "mime_type" SET NOT NULL;

-- Backfill preview MIME type for existing records when missing
UPDATE "DatasetBlob"
SET "preview_mime_type" = COALESCE("preview_mime_type", 'audio/mpeg')
WHERE "preview_blob_id" IS NOT NULL
  AND "preview_blob_id" <> '';


-- Add MIME type tracking for dataset blobs
ALTER TABLE "DatasetBlob"
ADD COLUMN "mime_type" TEXT NOT NULL DEFAULT 'audio/mpeg';

ALTER TABLE "DatasetBlob"
ADD COLUMN "preview_mime_type" TEXT;

-- Backfill preview MIME type for existing records
UPDATE "DatasetBlob"
SET "preview_mime_type" = 'audio/mpeg'
WHERE "preview_blob_id" IS NOT NULL
  AND "preview_blob_id" <> '';


-- Add metadata fields to Dataset table
-- These fields store rich AI-generated and user-provided metadata

-- AI-generated verification data
ALTER TABLE "Dataset" ADD COLUMN "transcript" TEXT;
ALTER TABLE "Dataset" ADD COLUMN "transcript_length" INTEGER;
ALTER TABLE "Dataset" ADD COLUMN "transcription_details" JSONB;
ALTER TABLE "Dataset" ADD COLUMN "analysis" JSONB;
ALTER TABLE "Dataset" ADD COLUMN "quality_breakdown" JSONB;

-- User-provided metadata
ALTER TABLE "Dataset" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Dataset" ADD COLUMN "per_file_metadata" JSONB;
ALTER TABLE "Dataset" ADD COLUMN "audio_quality" JSONB;
ALTER TABLE "Dataset" ADD COLUMN "speakers" JSONB;
ALTER TABLE "Dataset" ADD COLUMN "categorization" JSONB;

-- Search optimization (vector already exists from previous migration)
-- ALTER TABLE "Dataset" ADD COLUMN "embedding" vector(1536);

-- Metadata tracking
ALTER TABLE "Dataset" ADD COLUMN "metadata_updated_at" TIMESTAMP(3);
ALTER TABLE "Dataset" ADD COLUMN "wallet_address" TEXT;

-- Create indexes for new fields
CREATE INDEX "Dataset_transcript_length_idx" ON "Dataset"("transcript_length");
CREATE INDEX "Dataset_metadata_updated_at_idx" ON "Dataset"("metadata_updated_at");
CREATE INDEX "Dataset_wallet_address_idx" ON "Dataset"("wallet_address");

-- Create GIN index for tags array search
CREATE INDEX "Dataset_tags_idx" ON "Dataset" USING GIN("tags");

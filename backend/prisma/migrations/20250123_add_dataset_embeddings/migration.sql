-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to Dataset table
ALTER TABLE "Dataset"
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add indexed_at timestamp to track sync status
ALTER TABLE "Dataset"
ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMP WITH TIME ZONE;

-- Add blockchain sync tracking
ALTER TABLE "Dataset"
ADD COLUMN IF NOT EXISTS blockchain_synced_at TIMESTAMP WITH TIME ZONE;

-- Create HNSW index for fast semantic similarity search
-- HNSW is faster than IVFFlat for most workloads
CREATE INDEX IF NOT EXISTS idx_dataset_embedding_hnsw
ON "Dataset" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create index for finding unindexed datasets
CREATE INDEX IF NOT EXISTS idx_dataset_indexed_at
ON "Dataset"(indexed_at)
WHERE indexed_at IS NULL;

-- Create index for blockchain sync status
CREATE INDEX IF NOT EXISTS idx_dataset_blockchain_synced
ON "Dataset"(blockchain_synced_at DESC);

-- Add comment
COMMENT ON COLUMN "Dataset".embedding IS 'Text embedding (1536d) generated from title + description for semantic search';
COMMENT ON COLUMN "Dataset".indexed_at IS 'Timestamp when embedding was last generated';
COMMENT ON COLUMN "Dataset".blockchain_synced_at IS 'Timestamp when dataset was last synced from blockchain';

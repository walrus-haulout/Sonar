-- Migration: Upgrade to Qdrant and improve vector search performance
-- Adds Qdrant sync tracking, upgrades index strategy to HNSW

-- Add column to track Qdrant sync status (replace Pinecone tracking)
ALTER TABLE verification_sessions
ADD COLUMN IF NOT EXISTS qdrant_synced BOOLEAN DEFAULT FALSE;

-- Create index for finding vectors not yet synced to Qdrant
CREATE INDEX IF NOT EXISTS idx_sessions_qdrant_synced
ON verification_sessions(qdrant_synced)
WHERE qdrant_synced = FALSE;

-- Drop old IVFFlat index and create HNSW index for better performance
-- HNSW (Hierarchical Navigable Small World) is better for semantic search
-- and provides superior query performance for this use case
DROP INDEX IF EXISTS idx_sessions_embedding;

CREATE INDEX IF NOT EXISTS idx_sessions_embedding_hnsw
ON verification_sessions USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
